# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
from django.db import transaction

from plane.db.models import (
    Cycle,
    CycleIssue,
    Estimate,
    EstimatePoint,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Project,
    State,
)
from plane.utils.cycle_snapshot import (
    capture_cycle_snapshot,
    prepare_cycle_snapshot,
    public_snapshot,
    refresh_cycle_snapshot,
)


@pytest.fixture
def reporting(db, workspace, create_user, monkeypatch):
    now = datetime(2026, 9, 7, 12, tzinfo=dt_timezone.utc)
    monkeypatch.setattr("django.utils.timezone.now", lambda: now)
    project = Project.objects.create(name="Cycle reporting", identifier="REPORT", workspace=workspace)
    estimate = Estimate.objects.create(name="Points", type="points", project=project, workspace=workspace)
    project.estimate = estimate
    project.save(update_fields=["estimate"])
    points = {
        value: EstimatePoint.objects.create(
            estimate=estimate, key=value, value=str(value), project=project, workspace=workspace
        )
        for value in (3, 5)
    }
    states = {
        group: State.objects.create(name=group, group=group, color="#123456", project=project, workspace=workspace)
        for group in ("started", "completed")
    }
    label = Label.objects.create(name="Original", color="#123456", project=project, workspace=workspace)

    def cycle(name, days_ago=1):
        return Cycle.objects.create(
            name=name,
            owned_by=create_user,
            project=project,
            workspace=workspace,
            start_date=now - timedelta(days=days_ago + 2),
            end_date=now - timedelta(days=days_ago),
        )

    def issue(cycle, value=3):
        work_item = Issue.objects.create(
            name="Work",
            project=project,
            workspace=workspace,
            state=states["started"],
            estimate_point=points[value],
        )
        CycleIssue.objects.create(cycle=cycle, issue=work_item, project=project, workspace=workspace)
        IssueAssignee.objects.create(issue=work_item, assignee=create_user, project=project, workspace=workspace)
        IssueLabel.objects.create(issue=work_item, label=label, project=project, workspace=workspace)
        return work_item

    return cycle, issue, states, points, now, label, create_user


def move(source, destination, issue):
    with transaction.atomic():
        prepare_cycle_snapshot(destination)
        capture_cycle_snapshot(source, [issue.pk])
        CycleIssue.objects.filter(cycle=source, issue=issue).update(cycle=destination)
        refresh_cycle_snapshot(source)
        refresh_cycle_snapshot(destination)


@pytest.mark.unit
class TestCycleSnapshot:
    def test_repeated_transfers_preserve_previous_contributions(self, reporting):
        cycle, issue, states, points, now, label, user = reporting
        source = cycle("Previous")
        destination = cycle("Current", days_ago=-3)
        first = issue(source)
        move(source, destination, first)
        original = public_snapshot(refresh_cycle_snapshot(source))

        with transaction.atomic():
            prepare_cycle_snapshot(destination)
            Issue.objects.filter(pk=first.pk).update(
                state=states["completed"], completed_at=now, estimate_point=points[5]
            )
            IssueAssignee.objects.filter(issue=first).delete()
            IssueLabel.objects.filter(issue=first).delete()
            refresh_cycle_snapshot(destination)
        assert public_snapshot(refresh_cycle_snapshot(source)) == original
        assert refresh_cycle_snapshot(destination) == {}

        with transaction.atomic():
            prepare_cycle_snapshot(source)
            second = issue(source, value=5)
            refresh_cycle_snapshot(source)
        move(source, destination, second)
        snapshot = refresh_cycle_snapshot(source)
        assert snapshot["total_issues"] == 2
        assert snapshot["started_issues"] == 2
        assert snapshot["total_estimate_points"] == 8
        assert snapshot["distribution"]["assignees"][0]["assignee_id"] == str(user.pk)
        assert snapshot["distribution"]["assignees"][0]["pending_issues"] == 2
        assert snapshot["estimate_distribution"]["labels"][0]["pending_estimates"] == 8
        assert set(snapshot["distribution"]["completion_chart"].values()) == {2}
        assert set(snapshot["estimate_distribution"]["completion_chart"].values()) == {8}

    def test_late_add_status_estimate_and_removal_update_all_reports(self, reporting):
        cycle, issue, states, points, now, *_ = reporting
        source = cycle("Previous")
        prepare_cycle_snapshot(source)
        work_item = issue(source)
        refresh_cycle_snapshot(source)
        with transaction.atomic():
            prepare_cycle_snapshot(source)
            Issue.objects.filter(pk=work_item.pk).update(
                state=states["completed"],
                completed_at=now,
                estimate_point=points[5],
            )
            snapshot = refresh_cycle_snapshot(source)
        assert snapshot["completed_issues"] == 1
        assert snapshot["completed_estimate_points"] == 5
        assert snapshot["distribution"]["labels"][0]["completed_issues"] == 1
        assert snapshot["estimate_distribution"]["assignees"][0]["completed_estimates"] == 5
        assert snapshot["distribution"]["completion_chart"][source.start_date.date().isoformat()] == 1
        assert snapshot["estimate_distribution"]["completion_chart"][source.end_date.date().isoformat()] == 0
        assert snapshot["distribution"]["completion_chart"][source.end_date.date().isoformat()] == 0
        work_item.refresh_from_db()
        assert work_item.completed_at == now
        with transaction.atomic():
            prepare_cycle_snapshot(source)
            CycleIssue.objects.filter(cycle=source, issue=work_item).delete()
            snapshot = refresh_cycle_snapshot(source)
        assert snapshot["total_issues"] == 0
        assert snapshot["total_estimate_points"] == 0
        assert snapshot["distribution"]["labels"] == []
        assert set(snapshot["distribution"]["completion_chart"].values()) == {0}

    def test_legacy_transferred_scope_is_baseline_not_reconstructed(self, reporting):
        cycle, issue, states, points, now, *_ = reporting
        source = cycle("Previous")
        destination = cycle("Current", days_ago=-3)
        transferred = issue(source)
        remaining = issue(source, value=5)
        move(source, destination, transferred)
        legacy = public_snapshot(refresh_cycle_snapshot(source))
        for key in list(legacy):
            if key.endswith("estimate_points"):
                del legacy[key]
        Cycle.objects.filter(pk=source.pk).update(progress_snapshot=legacy)
        Issue.objects.filter(pk=transferred.pk).update(state=states["completed"], completed_at=now)
        with transaction.atomic():
            prepare_cycle_snapshot(source)
            Issue.objects.filter(pk=remaining.pk).update(state=states["completed"], completed_at=source.end_date)
            snapshot = refresh_cycle_snapshot(source)
        assert snapshot["total_issues"] == 2
        assert snapshot["completed_issues"] == 1
        assert snapshot["started_issues"] == 1
        assert snapshot["total_estimate_points"] is None
        assert snapshot["estimate_distribution"]["labels"][0]["total_estimates"] == 8
        assert snapshot["estimate_distribution"]["labels"][0]["completed_estimates"] == 5
        assert snapshot["distribution"]["completion_chart"][source.end_date.date().isoformat()] == 1
        assert snapshot["estimate_distribution"]["completion_chart"][source.end_date.date().isoformat()] == 3
        move(source, destination, remaining)
        assert public_snapshot(refresh_cycle_snapshot(source)) == public_snapshot(snapshot)

    def test_legacy_extended_chart_dates_remain_unknown(self, reporting):
        cycle, issue, *_ = reporting
        source = cycle("Previous")
        issue(source)
        legacy = public_snapshot(refresh_cycle_snapshot(source))
        Cycle.objects.filter(pk=source.pk).update(progress_snapshot=legacy)
        with transaction.atomic():
            prepare_cycle_snapshot(source)
            Cycle.objects.filter(pk=source.pk).update(start_date=source.start_date - timedelta(days=1))
            snapshot = refresh_cycle_snapshot(source)
        extra_date = (source.start_date - timedelta(days=1)).date().isoformat()
        assert snapshot["distribution"]["completion_chart"][extra_date] is None
        assert snapshot["estimate_distribution"]["completion_chart"][extra_date] is None
        assert snapshot["distribution"]["completion_chart"][source.start_date.date().isoformat()] == 1

    def test_frozen_cycle_initializes_once_and_never_changes(self, reporting):
        cycle, issue, states, points, now, *_ = reporting
        source = cycle("Older", days_ago=10)
        cycle("Previous", days_ago=2)
        cycle("Latest", days_ago=1)
        work_item = issue(source)
        snapshot = capture_cycle_snapshot(source)
        assert snapshot["total_issues"] == 1
        Issue.objects.filter(pk=work_item.pk).update(
            state=states["completed"], completed_at=now, estimate_point=points[5]
        )
        CycleIssue.objects.filter(cycle=source, issue=work_item).delete()
        assert refresh_cycle_snapshot(source) == snapshot
        assert capture_cycle_snapshot(source) == snapshot
        source.refresh_from_db()
        assert source.progress_snapshot == snapshot

    def test_rejoined_issue_can_be_removed_without_reviving_old_contribution(self, reporting):
        cycle, issue, *_ = reporting
        source = cycle("Previous")
        destination = cycle("Current", days_ago=-3)
        work_item = issue(source)
        move(source, destination, work_item)
        move(destination, source, work_item)
        assert refresh_cycle_snapshot(source)["total_issues"] == 1
        with transaction.atomic():
            prepare_cycle_snapshot(source)
            CycleIssue.objects.filter(cycle=source, issue=work_item).delete()
            snapshot = refresh_cycle_snapshot(source)
        assert snapshot["total_issues"] == 0
        assert refresh_cycle_snapshot(destination)["total_issues"] == 1

    def test_report_dates_use_project_timezone_for_late_completion(self, reporting):
        cycle, issue, states, _, now, *_ = reporting
        source = cycle("Previous")
        Project.objects.filter(pk=source.project_id).update(timezone="America/Los_Angeles")
        Cycle.objects.filter(pk=source.pk).update(
            start_date=datetime(2026, 9, 4, 2, tzinfo=dt_timezone.utc),
            end_date=datetime(2026, 9, 6, 2, tzinfo=dt_timezone.utc),
        )
        work_item = issue(source)
        with transaction.atomic():
            prepare_cycle_snapshot(source)
            Issue.objects.filter(pk=work_item.pk).update(state=states["completed"], completed_at=now)
            snapshot = refresh_cycle_snapshot(source)
        assert snapshot["distribution"]["completion_chart"] == {
            "2026-09-03": 1,
            "2026-09-04": 1,
            "2026-09-05": 0,
        }
        assert snapshot["estimate_distribution"]["completion_chart"] == {
            "2026-09-03": 3,
            "2026-09-04": 3,
            "2026-09-05": 0,
        }
        work_item.refresh_from_db()
        assert work_item.completed_at == now

    def test_active_and_draft_cycles_keep_live_reporting_until_outgoing_transfer(self, reporting):
        cycle, issue, states, _, now, *_ = reporting
        active = cycle("Active", days_ago=-1)
        draft = cycle("Draft", days_ago=-2)
        Cycle.objects.filter(pk=draft.pk).update(start_date=None, end_date=None)
        for current in (active, draft):
            work_item = issue(current)
            with transaction.atomic():
                assert prepare_cycle_snapshot(current) == {}
                Issue.objects.filter(pk=work_item.pk).update(state=states["completed"], completed_at=now)
                assert refresh_cycle_snapshot(current) == {}
            current.refresh_from_db()
            assert current.progress_snapshot == {}
        outgoing = issue(active)
        captured = capture_cycle_snapshot(active, [outgoing.pk])
        assert captured["total_issues"] == 2
        assert captured["completed_issues"] == 1
