# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import datetime

import pytest

from plane.db.models import Cycle, CycleIssue, Issue, Project, ProjectMember
from plane.utils.filters.filterset import IssueFilterSet


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Current Cycle Filter Project",
        identifier="CCF",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def cycle_issues(project, create_user):
    tz = datetime.timezone.utc
    cycles = {
        "first": Cycle.objects.create(
            name="First cycle",
            start_date=datetime.datetime(2026, 8, 1, tzinfo=tz),
            end_date=datetime.datetime(2026, 8, 15, 23, 59, tzinfo=tz),
            owned_by=create_user,
            project=project,
            workspace=project.workspace,
        ),
        "second": Cycle.objects.create(
            name="Second cycle",
            start_date=datetime.datetime(2026, 8, 16, tzinfo=tz),
            end_date=datetime.datetime(2026, 8, 31, 23, 59, tzinfo=tz),
            owned_by=create_user,
            project=project,
            workspace=project.workspace,
        ),
    }

    for cycle_name, cycle in cycles.items():
        issue = Issue.objects.create(
            name=f"{cycle_name} issue",
            project=project,
            workspace=project.workspace,
            created_by=create_user,
        )
        CycleIssue.objects.create(
            cycle=cycle,
            issue=issue,
            project=project,
            workspace=project.workspace,
        )

    return cycles


def _filter(project, data):
    filter_set = IssueFilterSet(data=data, queryset=Issue.objects.filter(project=project))
    assert filter_set.is_valid(), filter_set.errors
    return set(filter_set.qs.values_list("name", flat=True))


@pytest.mark.unit
class TestCurrentCycleFilter:
    def test_current_cycle_is_resolved_when_filter_is_evaluated(self, monkeypatch, project, cycle_issues):
        tz = datetime.timezone.utc
        monkeypatch.setattr(
            "plane.utils.filters.filterset.timezone.now",
            lambda: datetime.datetime(2026, 8, 10, tzinfo=tz),
        )
        assert _filter(project, {"cycle_id__exact": "current"}) == {"first issue"}

        monkeypatch.setattr(
            "plane.utils.filters.filterset.timezone.now",
            lambda: datetime.datetime(2026, 8, 20, tzinfo=tz),
        )
        assert _filter(project, {"cycle_id__exact": "current"}) == {"second issue"}

    def test_current_cycle_can_be_combined_with_selected_cycles(self, monkeypatch, project, cycle_issues):
        tz = datetime.timezone.utc
        monkeypatch.setattr(
            "plane.utils.filters.filterset.timezone.now",
            lambda: datetime.datetime(2026, 8, 10, tzinfo=tz),
        )

        value = f"current,{cycle_issues['second'].id}"
        assert _filter(project, {"cycle_id__in": value}) == {"first issue", "second issue"}
