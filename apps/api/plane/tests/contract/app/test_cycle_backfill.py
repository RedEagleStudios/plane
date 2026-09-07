# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.utils import timezone

from plane.db.models import Cycle, CycleIssue, Issue, Project, ProjectMember, State
from plane.utils.cycle_backfill import can_edit_cycle, cycle_editable_expression


@pytest.fixture
def backfill(db, workspace, create_user, monkeypatch):
    now = timezone.now()
    monkeypatch.setattr("django.utils.timezone.now", lambda: now)
    project = Project.objects.create(name="Backfill", identifier="BF", workspace=workspace, cycle_view=True)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    states = {
        group: State.objects.create(name=group, group=group, project=project, workspace=workspace)
        for group in ("started", "completed")
    }
    cycles = [
        Cycle.objects.create(
            name=f"Cycle {age}",
            project=project,
            workspace=workspace,
            owned_by=create_user,
            start_date=now - timedelta(days=age * 7 + 6),
            end_date=now - timedelta(days=age * 7),
        )
        for age in (1, 2, 3)
    ]
    current = Cycle.objects.create(
        name="Current",
        project=project,
        workspace=workspace,
        owned_by=create_user,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=5),
    )
    return project, cycles, current, states


@pytest.fixture(params=["app", "public"])
def cycle_api(request, session_client, api_key_client, workspace, backfill):
    project, *_ = backfill
    client = session_client if request.param == "app" else api_key_client
    prefix = "/api" if request.param == "app" else "/api/v1"
    root = f"{prefix}/workspaces/{workspace.slug}/projects/{project.id}"
    return client, root


@pytest.mark.contract
class TestCycleBackfill:
    def test_window_includes_archived_slots_and_is_project_scoped(self, backfill, workspace, create_user):
        project, cycles, current, _ = backfill
        other = Project.objects.create(name="Other", identifier="OTHER", workspace=workspace)
        for index in range(3):
            Cycle.objects.create(
                name=f"Foreign {index}",
                project=other,
                workspace=workspace,
                owned_by=create_user,
                start_date=timezone.now() - timedelta(days=2),
                end_date=timezone.now() - timedelta(hours=1),
            )
        eligibility = dict(
            Cycle.objects.filter(project=project)
            .annotate(is_editable=cycle_editable_expression())
            .values_list("id", "is_editable")
        )
        assert eligibility == {cycles[0].id: True, cycles[1].id: True, cycles[2].id: False, current.id: True}
        cycles[0].archived_at = timezone.now()
        cycles[0].save(update_fields=["archived_at"])
        assert not can_edit_cycle(cycles[0])
        assert can_edit_cycle(cycles[1])
        assert not can_edit_cycle(cycles[2])
        current.end_date = timezone.now() - timedelta(seconds=1)
        current.save(update_fields=["end_date"])
        assert not can_edit_cycle(cycles[1])

    def test_equal_end_dates_have_deterministic_policy(self, backfill):
        project, cycles, _, _ = backfill
        Cycle.objects.filter(id__in=[cycle.id for cycle in cycles]).update(end_date=cycles[0].end_date)
        rows = list(Cycle.objects.filter(id__in=[cycle.id for cycle in cycles]).order_by("-id"))
        annotated = dict(
            Cycle.objects.filter(project=project)
            .annotate(is_editable=cycle_editable_expression())
            .values_list("id", "is_editable")
        )
        assert [can_edit_cycle(cycle) for cycle in rows] == [True, True, False]
        assert [annotated[cycle.id] for cycle in rows] == [True, True, False]

    def test_recent_metadata_edit_and_locked_sort_order_bypass(self, cycle_api, backfill):
        client, root = cycle_api
        _, cycles, _, _ = backfill
        recent, _, old = cycles
        response = client.patch(f"{root}/cycles/{recent.id}/", {"name": "Corrected"}, format="json")
        assert response.status_code == 200, response.data
        recent.refresh_from_db()
        assert recent.name == "Corrected"
        response = client.patch(f"{root}/cycles/{old.id}/", {"name": "Must not change", "sort_order": 1}, format="json")
        assert response.status_code == 400, response.data
        old.refresh_from_db()
        assert old.name != "Must not change"
        response = client.patch(f"{root}/cycles/{old.id}/", {"sort_order": 1}, format="json")
        assert response.status_code == 200, response.data
        old.refresh_from_db()
        assert old.sort_order == 1

    def test_backfill_dates_cannot_reopen_cycle(self, cycle_api, backfill):
        client, root = cycle_api
        _, cycles, _, _ = backfill
        end = cycles[0].end_date
        response = client.patch(
            f"{root}/cycles/{cycles[0].id}/",
            {"end_date": (timezone.now() + timedelta(days=1)).date().isoformat()},
            format="json",
        )
        assert response.status_code == 400, response.data
        cycles[0].refresh_from_db()
        assert cycles[0].end_date == end

    def test_backfill_membership_updates_snapshot_and_blocks_older_cycle(self, cycle_api, backfill, workspace):
        client, root = cycle_api
        project, cycles, _, states = backfill
        issue = Issue.objects.create(
            name="Missed work",
            project=project,
            workspace=workspace,
            state=states["started"],
        )
        response = client.post(
            f"{root}/cycles/{cycles[0].id}/cycle-issues/",
            {"issues": [str(issue.id)]},
            format="json",
        )
        assert response.status_code in (200, 201), response.data
        cycles[0].refresh_from_db()
        assert cycles[0].progress_snapshot["total_issues"] == 1
        response = client.post(
            f"{root}/cycles/{cycles[2].id}/cycle-issues/",
            {"issues": [str(issue.id)]},
            format="json",
        )
        assert response.status_code == 400, response.data
        assert CycleIssue.objects.filter(cycle=cycles[0], issue=issue).exists()
        response = client.delete(f"{root}/cycles/{cycles[0].id}/cycle-issues/{issue.id}/")
        assert response.status_code == 204, response.data
        cycles[0].refresh_from_db()
        assert cycles[0].progress_snapshot["total_issues"] == 0

    def test_transfer_then_late_completion_preserves_scope_and_refreshes_analytics(
        self, backfill, session_client, workspace
    ):
        project, cycles, current, states = backfill
        source = cycles[0]
        root = f"/api/workspaces/{workspace.slug}/projects/{project.id}"
        carried = Issue.objects.create(name="Carried", project=project, workspace=workspace, state=states["started"])
        CycleIssue.objects.create(cycle=source, issue=carried, project=project, workspace=workspace)
        response = session_client.post(
            f"{root}/cycles/{source.id}/transfer-issues/",
            {"new_cycle_id": str(current.id)},
            format="json",
        )
        assert response.status_code == 200, response.data
        late = Issue.objects.create(name="Late record", project=project, workspace=workspace, state=states["started"])
        response = session_client.post(
            f"{root}/cycles/{source.id}/cycle-issues/",
            {"issues": [str(late.id)]},
            format="json",
        )
        assert response.status_code == 201, response.data
        response = session_client.patch(
            f"{root}/issues/{late.id}/",
            {"state_id": str(states["completed"].id)},
            format="json",
        )
        assert response.status_code == 204, response.data
        response = session_client.patch(
            f"{root}/issues/{carried.id}/",
            {"state_id": str(states["completed"].id)},
            format="json",
        )
        assert response.status_code == 204, response.data
        progress = session_client.get(f"{root}/cycles/{source.id}/progress/")
        assert progress.status_code == 200, progress.data
        assert progress.data["total_issues"] == 2
        assert progress.data["completed_issues"] == 1
        analytics = session_client.get(f"{root}/cycles/{source.id}/analytics/")
        assert analytics.status_code == 200, analytics.data
        chart = analytics.data["completion_chart"]
        assert chart[max(chart)] == 1
        detail = session_client.get(f"{root}/cycles/{source.id}/")
        assert detail.data["is_editable"] is True
        assert "_reporting" not in detail.data["progress_snapshot"]
        assert CycleIssue.objects.filter(cycle=current, issue=carried).exists()
