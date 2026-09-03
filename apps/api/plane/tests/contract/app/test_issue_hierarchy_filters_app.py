# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
)


@pytest.fixture
def hierarchy_context(db, workspace, create_user):
    project = Project.objects.create(
        name="Hierarchy filters",
        identifier="HF",
        workspace=workspace,
        created_by=create_user,
        module_view=True,
    )
    ProjectMember.objects.create(
        project=project,
        workspace=workspace,
        member=create_user,
        role=20,
        is_active=True,
    )
    in_progress = State.objects.create(
        name="In Progress",
        project=project,
        workspace=workspace,
        group="started",
        default=True,
    )
    testing = State.objects.create(
        name="Testing",
        project=project,
        workspace=workspace,
        group="started",
    )
    module = Module.objects.create(
        name="Combine Aura",
        project=project,
        workspace=workspace,
        created_by=create_user,
    )
    label = Label.objects.create(
        name="Bug",
        color="#EB144C",
        project=project,
        workspace=workspace,
        created_by=create_user,
    )

    root = Issue.objects.create(
        name="Core Mechanics",
        project=project,
        workspace=workspace,
        state=in_progress,
        created_by=create_user,
    )
    branch = Issue.objects.create(
        name="Nested context",
        project=project,
        workspace=workspace,
        state=in_progress,
        parent=root,
        created_by=create_user,
    )
    matching_leaf = Issue.objects.create(
        name="Cooldown text sometimes does not show up",
        project=project,
        workspace=workspace,
        state=testing,
        parent=branch,
        created_by=create_user,
    )
    non_matching_sibling = Issue.objects.create(
        name="Unrelated child",
        project=project,
        workspace=workspace,
        state=in_progress,
        parent=branch,
        created_by=create_user,
    )
    matching_root = Issue.objects.create(
        name="Top-level testing issue",
        project=project,
        workspace=workspace,
        state=testing,
        created_by=create_user,
    )

    for issue in (matching_leaf, matching_root):
        IssueLabel.objects.create(
            issue=issue,
            label=label,
            project=project,
            workspace=workspace,
            created_by=create_user,
        )
        ModuleIssue.objects.create(
            issue=issue,
            module=module,
            project=project,
            workspace=workspace,
            created_by=create_user,
        )

    filters = {
        "and": [
            {"module_id__in": str(module.id)},
            {"label_id__in": str(label.id)},
            {"state_id__in": str(testing.id)},
        ]
    }
    query = {
        "filters": json.dumps(filters),
        "layout": "grouped_spreadsheet",
        "sub_issue": "false",
    }
    return project, root, branch, matching_leaf, non_matching_sibling, matching_root, query


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueHierarchyFilters:
    def test_issue_list_keeps_roots_for_matching_descendants(self, session_client, workspace, hierarchy_context):
        project, root, _branch, matching_leaf, _sibling, matching_root, query = hierarchy_context
        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"

        response = session_client.get(url, query)

        assert response.status_code == status.HTTP_200_OK, response.data
        returned_ids = {str(issue["id"]) for issue in response.data["results"]}
        assert returned_ids == {str(root.id), str(matching_root.id)}
        assert str(matching_leaf.id) not in returned_ids

    def test_sub_issue_expansion_keeps_only_matching_branches(self, session_client, workspace, hierarchy_context):
        project, root, branch, matching_leaf, non_matching_sibling, _matching_root, query = hierarchy_context

        root_response = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{root.id}/sub-issues/",
            query,
        )
        branch_response = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{branch.id}/sub-issues/",
            query,
        )

        assert root_response.status_code == status.HTTP_200_OK, root_response.data
        assert [str(issue["id"]) for issue in root_response.data["sub_issues"]] == [str(branch.id)]
        assert branch_response.status_code == status.HTTP_200_OK, branch_response.data
        returned_ids = {str(issue["id"]) for issue in branch_response.data["sub_issues"]}
        assert returned_ids == {str(matching_leaf.id)}
        assert str(non_matching_sibling.id) not in returned_ids

    def test_non_hierarchy_layout_preserves_top_level_only_filtering(
        self, session_client, workspace, hierarchy_context
    ):
        project, _root, _branch, _leaf, _sibling, matching_root, query = hierarchy_context
        query["layout"] = "kanban"
        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"

        response = session_client.get(url, query)

        assert response.status_code == status.HTTP_200_OK, response.data
        assert [str(issue["id"]) for issue in response.data["results"]] == [str(matching_root.id)]
