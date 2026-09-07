# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from contextlib import contextmanager

from django.db import transaction
from django.db.models import BooleanField, Case, Exists, OuterRef, Q, Value, When
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from plane.db.models import Cycle, CycleIssue, Issue, Project


BACKFILL_CYCLE_LIMIT = 2
BACKFILL_LOCKED_MESSAGE = "Only the two most recently completed cycles can be edited."
CYCLE_REPORT_FIELDS = frozenset(
    {
        "state",
        "state_id",
        "estimate_point",
        "estimate_point_id",
        "assignees",
        "assignee_ids",
        "labels",
        "label_ids",
        "completed_at",
        "archived_at",
        "is_draft",
        "deleted_at",
    }
)


def can_edit_cycle(cycle, now=None):
    now = now or timezone.now()
    if cycle.archived_at:
        return False
    if cycle.end_date is None or cycle.end_date >= now:
        return True
    # Archived cycles still occupy their chronological slot in the window.
    newer = Cycle.objects.filter(
        workspace_id=cycle.workspace_id,
        project_id=cycle.project_id,
        end_date__lt=now,
    ).filter(Q(end_date__gt=cycle.end_date) | Q(end_date=cycle.end_date, id__gt=cycle.id))
    return not newer.order_by().values("id")[BACKFILL_CYCLE_LIMIT - 1 : BACKFILL_CYCLE_LIMIT].exists()


def cycle_editable_expression(now=None):
    now = now or timezone.now()
    newer = Cycle.objects.filter(
        workspace_id=OuterRef("workspace_id"),
        project_id=OuterRef("project_id"),
        end_date__lt=now,
    ).filter(Q(end_date__gt=OuterRef("end_date")) | Q(end_date=OuterRef("end_date"), id__gt=OuterRef("id")))
    return Case(
        When(archived_at__isnull=False, then=Value(False)),
        When(Q(end_date__isnull=True) | Q(end_date__gte=now), then=Value(True)),
        default=~Exists(newer.order_by()[BACKFILL_CYCLE_LIMIT - 1 : BACKFILL_CYCLE_LIMIT]),
        output_field=BooleanField(),
    )


def validate_cycle_dates(cycle, data):
    start = data.get("start_date", cycle.start_date if cycle else None)
    end = data.get("end_date", cycle.end_date if cycle else None)
    if bool(start) != bool(end):
        raise ValidationError("Both start date and end date are either required or are to be null.")
    if start and end and start > end:
        raise ValidationError("Start date cannot exceed end date.")
    if cycle and cycle.end_date and cycle.end_date < timezone.now():
        if not end or end >= timezone.now():
            raise ValidationError("Backfilling a completed cycle cannot reopen it or remove its dates.")
    if cycle and start and end and {"start_date", "end_date"}.intersection(data):
        if (
            Cycle.objects.filter(
                workspace_id=cycle.workspace_id,
                project_id=cycle.project_id,
                start_date__lte=end,
                end_date__gte=start,
            )
            .exclude(pk=cycle.pk)
            .exists()
        ):
            raise ValidationError("A cycle already exists in the selected date range.")


def cycle_issue_mutation(issue):
    return cycle_issues_mutation(
        Issue.objects.filter(pk=issue.pk, workspace_id=issue.workspace_id, project_id=issue.project_id)
    )


@contextmanager
def cycle_issues_mutation(issues):
    """Keep reporting consistent with scoped work-item writes, including bulk writes."""
    from plane.utils.cycle_snapshot import capture_cycle_snapshot, prepare_cycle_snapshot, refresh_cycle_snapshot

    with transaction.atomic():
        # Membership can change while we locate source cycles. Serialize project
        # reporting writes before reading memberships, then lock cycles in ID order.
        list(Project.objects.filter(id__in=issues.values("project_id")).order_by("id").select_for_update().only("id"))
        cycles = list(
            Cycle.objects.filter(
                id__in=CycleIssue.objects.filter(issue__in=issues).values("cycle_id"),
            )
            .order_by("id")
            .select_for_update()
        )
        for cycle in cycles:
            if can_edit_cycle(cycle):
                prepare_cycle_snapshot(cycle)
            elif not cycle.progress_snapshot:
                # Ordinary work-item editing stays available, but must not rewrite a closed report.
                capture_cycle_snapshot(cycle)
        yield
        for cycle in cycles:
            if can_edit_cycle(cycle):
                refresh_cycle_snapshot(cycle)


def prepare_cycle_membership_change(slug, project_id, cycle_id, issue_ids):
    """Lock and snapshot source/destination cycles before assigning work items."""
    from plane.utils.cycle_snapshot import capture_cycle_snapshot, prepare_cycle_snapshot

    Project.objects.select_for_update().only("id").get(pk=project_id, workspace__slug=slug)
    memberships = list(
        CycleIssue.objects.filter(workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids).values_list(
            "cycle_id", "issue_id"
        )
    )
    ids = {source_id for source_id, _ in memberships}
    ids.add(cycle_id)
    cycles = list(
        Cycle.objects.filter(workspace__slug=slug, project_id=project_id, id__in=ids).order_by("id").select_for_update()
    )
    target = next((cycle for cycle in cycles if str(cycle.id) == str(cycle_id)), None)
    if target is None:
        raise ValidationError("Cycle not found.")
    if not can_edit_cycle(target):
        raise ValidationError(BACKFILL_LOCKED_MESSAGE)
    for cycle in cycles:
        if cycle.archived_at:
            raise ValidationError("Archived cycles cannot be changed.")
        if cycle.id != target.id and cycle.end_date and cycle.end_date < timezone.now():
            capture_cycle_snapshot(cycle, [issue_id for source_id, issue_id in memberships if source_id == cycle.id])
        else:
            prepare_cycle_snapshot(cycle)
    return cycles
