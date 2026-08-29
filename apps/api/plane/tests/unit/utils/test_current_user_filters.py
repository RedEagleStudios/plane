# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from types import SimpleNamespace

import pytest

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, User
from plane.utils.filters.filter_backend import ComplexFilterBackend
from plane.utils.filters.filterset import IssueFilterSet


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Current User Filter Project",
        identifier="CUF",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def assigned_issues(project, create_user):
    other_user = User.objects.create(
        email="other-assignee@example.com",
        username="other-assignee",
        first_name="Other",
        last_name="Assignee",
    )
    ProjectMember.objects.create(project=project, member=other_user, role=15, is_active=True)

    for assignee, issue_name in ((create_user, "owner issue"), (other_user, "other issue")):
        issue = Issue.objects.create(
            name=issue_name,
            project=project,
            workspace=project.workspace,
            created_by=create_user,
        )
        IssueAssignee.objects.create(
            issue=issue,
            assignee=assignee,
            project=project,
            workspace=project.workspace,
        )

    return other_user


def _filter_as(project, user, data):
    request = SimpleNamespace(user=user, query_params={"filters": json.dumps(data)})
    view = SimpleNamespace(filterset_class=IssueFilterSet, request=request)
    queryset = ComplexFilterBackend().filter_queryset(
        request,
        Issue.objects.filter(project=project),
        view,
    )
    return set(queryset.values_list("name", flat=True))


@pytest.mark.unit
class TestCurrentUserAssigneeFilter:
    def test_me_is_resolved_for_the_user_evaluating_the_view(self, project, create_user, assigned_issues):
        assert _filter_as(project, create_user, {"assignee_id__exact": "me"}) == {"owner issue"}
        assert _filter_as(project, assigned_issues, {"assignee_id__exact": "me"}) == {"other issue"}

    def test_me_can_be_combined_with_selected_assignees(self, project, create_user, assigned_issues):
        value = f"me,{create_user.id}"
        assert _filter_as(project, assigned_issues, {"assignee_id__in": value}) == {
            "owner issue",
            "other issue",
        }
