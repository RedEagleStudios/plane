# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from celery import shared_task
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from plane.db.models import Cycle, Project, ProjectMember

logger = logging.getLogger(__name__)

CYCLE_NUMBER_SUFFIX = re.compile(r"^(.*?)(\d+)\s*$")


def increment_cycle_name(previous_name: str) -> str:
    match = CYCLE_NUMBER_SUFFIX.match(previous_name)
    if not match:
        return f"{previous_name.rstrip()} 1"

    prefix, numeric_suffix = match.groups()
    incremented_suffix = str(int(numeric_suffix) + 1).zfill(len(numeric_suffix))
    return f"{prefix}{incremented_suffix}"


def scheduled_cycle_window(
    start_date: date,
    duration_days: int,
    timezone_name: str,
) -> tuple[datetime, datetime]:
    project_timezone = ZoneInfo(timezone_name)
    end_date = start_date + timedelta(days=duration_days - 1)
    start_at = datetime.combine(start_date, time(0, 0, 1), tzinfo=project_timezone)
    end_at = datetime.combine(end_date, time(23, 59), tzinfo=project_timezone)
    return start_at.astimezone(UTC), end_at.astimezone(UTC)


@transaction.atomic
def create_next_weekly_cycle(project_id, run_date: date) -> Cycle | None:
    project = Project.objects.select_for_update().get(pk=project_id)
    creation_weekday = (project.weekly_cycle_start_weekday - 1) % 7
    if (
        not project.weekly_cycle_auto_create
        or not project.cycle_view
        or project.archived_at is not None
        or run_date.weekday() != creation_weekday
    ):
        return None

    start_at, end_at = scheduled_cycle_window(
        run_date + timedelta(days=1),
        project.weekly_cycle_duration_days,
        project.timezone or "UTC",
    )
    overlapping_cycle_exists = Cycle.objects.filter(
        project=project,
        archived_at__isnull=True,
        start_date__lte=end_at,
        end_date__gte=start_at,
    ).exists()
    if overlapping_cycle_exists:
        return None

    latest_cycle = (
        Cycle.objects.filter(project=project)
        .order_by(F("end_date").desc(nulls_last=True), "-created_at")
        .first()
    )
    owner_id = latest_cycle.owned_by_id if latest_cycle else project.project_lead_id
    if owner_id is None:
        owner_id = (
            ProjectMember.objects.filter(project=project, is_active=True, role__gte=15)
            .order_by("-role", "created_at")
            .values_list("member_id", flat=True)
            .first()
        )
    if owner_id is None:
        logger.warning("Weekly cycle skipped because project %s has no eligible owner", project.id)
        return None

    cycle = Cycle(
        name=increment_cycle_name(latest_cycle.name if latest_cycle else "Sprint 0"),
        description="",
        start_date=start_at,
        end_date=end_at,
        owned_by_id=owner_id,
        project=project,
        workspace_id=project.workspace_id,
        timezone=latest_cycle.timezone if latest_cycle else project.timezone or "UTC",
        external_source="weekly-cycle-automation",
        external_id=f"weekly:{project.id}:{start_at.date().isoformat()}",
        created_by_id=owner_id,
    )
    cycle.save(disable_auto_set_user=True)
    return cycle


@shared_task
def create_weekly_project_cycles() -> int:
    now = timezone.now()
    created_cycle_count = 0
    project_settings = Project.objects.filter(
        weekly_cycle_auto_create=True,
        cycle_view=True,
        archived_at__isnull=True,
    ).values_list("id", "timezone", "weekly_cycle_start_weekday")

    for project_id, timezone_name, start_weekday in project_settings.iterator():
        local_date = now.astimezone(ZoneInfo(timezone_name or "UTC")).date()
        creation_weekday = (start_weekday - 1) % 7
        if local_date.weekday() != creation_weekday:
            continue
        if create_next_weekly_cycle(project_id, local_date) is not None:
            created_cycle_count += 1

    return created_cycle_count
