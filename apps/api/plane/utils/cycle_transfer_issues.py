# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from django.db import transaction
from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Cycle, CycleIssue, Project
from plane.utils.cycle_backfill import can_edit_cycle
from plane.utils.cycle_snapshot import capture_cycle_snapshot, prepare_cycle_snapshot, refresh_cycle_snapshot
from plane.utils.host import base_host


@transaction.atomic
def transfer_cycle_issues(slug, project_id, cycle_id, new_cycle_id, request, user_id):
    """Move incomplete work while preserving its source-cycle reporting contribution."""
    Project.objects.select_for_update().only("id").get(pk=project_id, workspace__slug=slug)
    cycles = {
        str(cycle.pk): cycle
        for cycle in Cycle.objects.select_for_update()
        .filter(workspace__slug=slug, project_id=project_id, pk__in=[cycle_id, new_cycle_id])
        .order_by("id")
    }
    source = cycles.get(str(cycle_id))
    destination = cycles.get(str(new_cycle_id))
    if source is None:
        return {"success": False, "error": "Source cycle not found"}
    if destination is None:
        return {"success": False, "error": "Destination cycle not found"}
    if source.pk == destination.pk:
        return {"success": False, "error": "Source and destination cycles must be different"}
    if source.archived_at:
        return {"success": False, "error": "Archived cycles cannot be changed"}
    if not can_edit_cycle(destination):
        return {"success": False, "error": "The destination cycle is no longer editable"}

    cycle_issues = list(
        CycleIssue.objects.select_for_update().filter(
            cycle_id=source.pk,
            project_id=project_id,
            workspace_id=source.workspace_id,
            issue__project_id=project_id,
            issue__workspace_id=source.workspace_id,
            issue__deleted_at__isnull=True,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
            issue__state__group__in=["backlog", "unstarted", "started"],
        )
    )
    prepare_cycle_snapshot(destination)
    capture_cycle_snapshot(source, [item.issue_id for item in cycle_issues])
    existing = set(
        CycleIssue.objects.filter(
            cycle_id=destination.pk,
            project_id=project_id,
            workspace_id=source.workspace_id,
            issue_id__in=[item.issue_id for item in cycle_issues],
        ).values_list("issue_id", flat=True)
    )
    updated = []
    duplicate_ids = []
    activities = []
    for cycle_issue in cycle_issues:
        if cycle_issue.issue_id in existing:
            duplicate_ids.append(cycle_issue.pk)
        else:
            cycle_issue.cycle_id = destination.pk
            updated.append(cycle_issue)
        activities.append(
            {
                "old_cycle_id": str(source.pk),
                "new_cycle_id": str(destination.pk),
                "issue_id": str(cycle_issue.issue_id),
            }
        )
    CycleIssue.objects.bulk_update(updated, ["cycle_id"], batch_size=100)
    if duplicate_ids:
        CycleIssue.objects.filter(
            pk__in=duplicate_ids, workspace_id=source.workspace_id, project_id=project_id
        ).delete()
    refresh_cycle_snapshot(source)
    refresh_cycle_snapshot(destination)

    if activities:
        activity_data = {
            "type": "cycle.activity.created",
            "requested_data": json.dumps({"cycles_list": []}),
            "actor_id": str(user_id),
            "issue_id": None,
            "project_id": str(project_id),
            "current_instance": json.dumps({"updated_cycle_issues": activities, "created_cycle_issues": []}),
            "epoch": int(timezone.now().timestamp()),
            "notification": True,
            "origin": base_host(request=request, is_app=True),
        }
        transaction.on_commit(lambda: issue_activity.delay(**activity_data))
    return {"success": True}
