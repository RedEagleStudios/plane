# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import defaultdict
from copy import deepcopy
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone

from plane.db.models import Cycle, Issue, IssueAssignee, IssueLabel, Project
from plane.utils.cycle_backfill import can_edit_cycle


_GROUPS = ("backlog", "unstarted", "started", "cancelled", "completed")
_METADATA = "_reporting"


def public_snapshot(snapshot):
    """Return the reporting payload without per-work-item bookkeeping."""
    return {key: value for key, value in snapshot.items() if key != _METADATA}


def _members(cycle, points):
    report_timezone = ZoneInfo(cycle.project.timezone)
    completed_cycle = cycle.end_date is not None and cycle.end_date < timezone.now()
    end_date = timezone.localdate(cycle.end_date, report_timezone) if completed_cycle else None
    issues = (
        Issue.issue_objects.filter(
            workspace_id=cycle.workspace_id,
            project_id=cycle.project_id,
            issue_cycle__cycle_id=cycle.pk,
            issue_cycle__deleted_at__isnull=True,
        )
        .select_related("state", "estimate_point")
        .only("id", "state__group", "estimate_point__value", "completed_at")
        .prefetch_related(
            Prefetch(
                "issue_assignee",
                queryset=IssueAssignee.objects.filter(workspace_id=cycle.workspace_id, project_id=cycle.project_id)
                .select_related("assignee")
                .only(
                    "issue_id",
                    "assignee_id",
                    "assignee__display_name",
                    "assignee__avatar_asset_id",
                    "assignee__avatar",
                ),
            ),
            Prefetch(
                "label_issue",
                queryset=IssueLabel.objects.filter(
                    workspace_id=cycle.workspace_id,
                    project_id=cycle.project_id,
                    label__deleted_at__isnull=True,
                )
                .select_related("label")
                .only("issue_id", "label_id", "label__name", "label__color"),
            ),
        )
    )
    members = {}
    for issue in issues:
        completed_date = timezone.localdate(issue.completed_at, report_timezone) if issue.completed_at else None
        if completed_date is not None and end_date is not None:
            # Backfill changes this report, never the work item's actual completion timestamp.
            completed_date = min(completed_date, end_date)
        members[str(issue.pk)] = {
            "group": issue.state.group if issue.state else None,
            "completed_date": completed_date.isoformat() if completed_date else None,
            "estimate": float(issue.estimate_point.value) if points and issue.estimate_point else 0,
            "assignees": [
                {
                    "assignee_id": str(link.assignee_id),
                    "display_name": link.assignee.display_name,
                    "avatar_url": (
                        f"/api/assets/v2/static/{link.assignee.avatar_asset_id}/"
                        if link.assignee.avatar_asset_id
                        else link.assignee.avatar
                    ),
                }
                for link in issue.issue_assignee.all()
            ]
            or [{"assignee_id": None, "display_name": None, "avatar_url": None}],
            "labels": [
                {"label_id": str(link.label_id), "label_name": link.label.name, "color": link.label.color}
                for link in issue.label_issue.all()
            ]
            or [{"label_id": None, "label_name": None, "color": None}],
        }
    return members


def _dates(cycle):
    if not cycle.start_date or not cycle.end_date:
        return []
    report_timezone = ZoneInfo(cycle.project.timezone)
    start = timezone.localdate(cycle.start_date, report_timezone)
    end = timezone.localdate(cycle.end_date, report_timezone)
    return [(start + timedelta(days=offset)).isoformat() for offset in range((end - start).days + 1)]


def _aggregate(members, dates, points, today):
    result = {f"{group}_issues": 0 for group in _GROUPS}
    result.update({f"{group}_estimate_points": 0 for group in _GROUPS})
    result.update(total_issues=0, total_estimate_points=0)
    distributions = {"distribution": {}, "estimate_distribution": {}}
    completed = {"distribution": defaultdict(float), "estimate_distribution": defaultdict(float)}
    for name in distributions:
        distributions[name] = {"assignees": {}, "labels": {}}
    for member in members.values():
        group = member["group"]
        estimate = member["estimate"]
        result["total_issues"] += 1
        result["total_estimate_points"] += estimate
        if group in _GROUPS:
            result[f"{group}_issues"] += 1
            result[f"{group}_estimate_points"] += estimate
        completion = member["completed_date"]
        if completion:
            completed["distribution"][completion] += 1
            completed["estimate_distribution"][completion] += estimate
        for name, suffix, value in (
            ("distribution", "issues", 1),
            ("estimate_distribution", "estimates", estimate),
        ):
            for dimension, id_key in (("assignees", "assignee_id"), ("labels", "label_id")):
                for identity in member[dimension]:
                    row = distributions[name][dimension].setdefault(
                        identity[id_key],
                        {**identity, f"total_{suffix}": 0, f"completed_{suffix}": 0, f"pending_{suffix}": 0},
                    )
                    row[f"total_{suffix}"] += value
                    row[f"{'completed' if completion else 'pending'}_{suffix}"] += value
    for name, total_key in (("distribution", "total_issues"), ("estimate_distribution", "total_estimate_points")):
        distribution = distributions[name]
        for dimension, sort_key in (("assignees", "display_name"), ("labels", "label_name")):
            distribution[dimension] = sorted(distribution[dimension].values(), key=lambda row: row[sort_key] or "")
        events = iter(sorted(completed[name].items()))
        event = next(events, None)
        remaining = result[total_key]
        chart = {}
        for date in dates:
            while event is not None and event[0] <= date:
                remaining -= event[1]
                event = next(events, None)
            chart[date] = remaining if date <= today else None
        distribution["completion_chart"] = chart
        result[name] = distribution if name == "distribution" or points else {}
    return result


def _legacy_delta(baseline, before, after):
    """Keep unobserved historical scope; apply only changes we actually witnessed."""
    result = deepcopy(baseline)
    for key, value in after.items():
        if isinstance(value, (int, float)):
            # Old snapshots did not capture estimates by state. Unknown is not zero.
            result[key] = baseline[key] + value - before[key] if baseline.get(key) is not None else None
    for name, suffix in (("distribution", "issues"), ("estimate_distribution", "estimates")):
        if not baseline.get(name):
            continue
        distribution = result[name]
        for dimension, id_key, sort_key in (
            ("assignees", "assignee_id", "display_name"),
            ("labels", "label_id", "label_name"),
        ):
            rows = {row[id_key]: row for row in distribution.get(dimension, [])}
            old = {row[id_key]: row for row in before[name].get(dimension, [])}
            new = {row[id_key]: row for row in after[name].get(dimension, [])}
            for key in old.keys() | new.keys():
                previous = old.get(key, {})
                current = new.get(key, {})
                changes = {
                    f"{metric}_{suffix}": (current.get(f"{metric}_{suffix}") or 0)
                    - (previous.get(f"{metric}_{suffix}") or 0)
                    for metric in ("total", "completed", "pending")
                }
                if not any(changes.values()):
                    continue
                if key not in rows:
                    rows[key] = {**(current or previous), **{metric: 0 for metric in changes}}
                row = rows[key]
                for metric, delta in changes.items():
                    row[metric] = (row.get(metric) or 0) + delta
            distribution[dimension] = sorted(
                [
                    row
                    for row in rows.values()
                    if any(row.get(f"{metric}_{suffix}") for metric in ("total", "completed", "pending"))
                ],
                key=lambda row: row.get(sort_key) or "",
            )
        chart = baseline[name].get("completion_chart", {})
        distribution["completion_chart"] = {
            date: (
                chart[date] + value - before[name]["completion_chart"][date]
                if chart.get(date) is not None and value is not None
                else None
            )
            for date, value in after[name].get("completion_chart", {}).items()
        }
    return result


def _render(cycle, metadata):
    members = {**metadata["retained"], **metadata["members"]}
    dates = _dates(cycle)
    today = timezone.localdate(timezone.now(), ZoneInfo(cycle.project.timezone)).isoformat()
    result = _aggregate(members, dates, metadata["points"], today)
    if "baseline" in metadata:
        before = _aggregate(metadata["original"], dates, metadata["points"], today)
        result = _legacy_delta(metadata["baseline"], before, result)
    result[_METADATA] = metadata
    return result


def _initialize(cycle):
    points = Project.objects.filter(
        pk=cycle.project_id, workspace_id=cycle.workspace_id, estimate__type="points"
    ).exists()
    members = _members(cycle, points)
    metadata = {"version": 1, "points": points, "members": members, "retained": {}}
    if cycle.progress_snapshot:
        metadata["baseline"] = deepcopy(cycle.progress_snapshot)
        metadata["original"] = deepcopy(members)
    return metadata


def _save(cycle, locked, snapshot):
    if snapshot != locked.progress_snapshot:
        Cycle.objects.filter(pk=locked.pk, workspace_id=locked.workspace_id, project_id=locked.project_id).update(
            progress_snapshot=snapshot
        )
    cycle.progress_snapshot = snapshot
    return snapshot


def _lock(cycle):
    return (
        Cycle.objects.select_related("project")
        .select_for_update(of=("self",))
        .get(pk=cycle.pk, workspace_id=cycle.workspace_id, project_id=cycle.project_id)
    )


@transaction.atomic
def prepare_cycle_snapshot(cycle):
    """Establish a before-image. Keep the caller's transaction open through mutation.

    Callers must lock all affected cycles in ID order before changing issues or
    memberships; the nested atomic block alone cannot protect a later mutation.
    """
    locked = _lock(cycle)
    if (
        not can_edit_cycle(locked)
        or _METADATA in locked.progress_snapshot
        or (not locked.progress_snapshot and (locked.end_date is None or locked.end_date >= timezone.now()))
    ):
        cycle.progress_snapshot = locked.progress_snapshot
        return cycle.progress_snapshot
    metadata = _initialize(locked)
    return _save(cycle, locked, _render(locked, metadata))


@transaction.atomic
def refresh_cycle_snapshot(cycle):
    """Refresh present members only; absent transferred contributions stay frozen."""
    locked = _lock(cycle)
    if not can_edit_cycle(locked) or (
        not locked.progress_snapshot and (locked.end_date is None or locked.end_date >= timezone.now())
    ):
        cycle.progress_snapshot = locked.progress_snapshot
        return cycle.progress_snapshot
    metadata = deepcopy(locked.progress_snapshot.get(_METADATA))
    if metadata is None:
        metadata = _initialize(locked)
    else:
        members = _members(locked, metadata["points"])
        # Rejoining a cycle makes an issue editable there again, once, not double-counted.
        for issue_id in members.keys() - metadata["members"].keys():
            metadata["retained"].pop(issue_id, None)
        metadata["members"] = members
    return _save(cycle, locked, _render(locked, metadata))


@transaction.atomic
def capture_cycle_snapshot(cycle, issue_ids=None):
    """Freeze outgoing issues before transfer, not ordinary explicit removals.

    The bulk transfer moves every incomplete member. Other move paths must pass
    their exact outgoing IDs and keep capture/move/refresh in one transaction.
    """
    locked = _lock(cycle)
    if not can_edit_cycle(locked):
        snapshot = locked.progress_snapshot
        if not snapshot:
            snapshot = _render(locked, _initialize(locked))
        return _save(cycle, locked, snapshot)
    refresh_cycle_snapshot(locked)
    metadata = deepcopy(locked.progress_snapshot.get(_METADATA))
    if metadata is None:
        # An explicit outgoing transfer establishes history even for an active cycle.
        metadata = _initialize(locked)
    outgoing = (
        {str(issue_id) for issue_id in issue_ids}
        if issue_ids is not None
        else {
            issue_id
            for issue_id, member in metadata["members"].items()
            if member["group"] in ("backlog", "unstarted", "started")
        }
    )
    for issue_id in outgoing:
        if issue_id in metadata["members"]:
            metadata["retained"][issue_id] = deepcopy(metadata["members"][issue_id])
    return _save(cycle, locked, _render(locked, metadata))
