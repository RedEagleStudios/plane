# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, Module, ModuleIssue, Project, ProjectMember, State


@pytest.fixture
def module_assignment_context(db, workspace, create_user):
    project = Project.objects.create(
        name="Module Policy Project",
        identifier="MPP",
        workspace=workspace,
        created_by=create_user,
        module_view=True,
        single_module_per_issue=True,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    state = State.objects.create(
        name="Backlog",
        project=project,
        workspace=workspace,
        group="backlog",
        default=True,
    )
    issue = Issue.objects.create(
        name="Module policy work item",
        workspace=workspace,
        project=project,
        state=state,
        created_by=create_user,
    )
    first_module = Module.objects.create(
        name="First module",
        workspace=workspace,
        project=project,
        created_by=create_user,
    )
    second_module = Module.objects.create(
        name="Second module",
        workspace=workspace,
        project=project,
        created_by=create_user,
    )
    ModuleIssue.objects.create(
        issue=issue,
        module=first_module,
        workspace=workspace,
        project=project,
        created_by=create_user,
    )
    return project, issue, first_module, second_module


def issue_modules_url(workspace_slug, project_id, issue_id):
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/modules/"


@pytest.mark.contract
@pytest.mark.django_db
class TestSingleModuleAssignment:
    def test_selecting_module_replaces_existing_assignment(
        self, session_client, workspace, module_assignment_context
    ):
        project, issue, first_module, second_module = module_assignment_context

        response = session_client.post(
            issue_modules_url(workspace.slug, project.id, issue.id),
            {
                "modules": [str(second_module.id)],
                "removed_modules": [str(first_module.id)],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert list(ModuleIssue.objects.filter(issue=issue).values_list("module_id", flat=True)) == [
            second_module.id
        ]

    def test_rejects_multiple_modules_in_single_module_project(
        self, session_client, workspace, module_assignment_context
    ):
        project, issue, first_module, second_module = module_assignment_context

        response = session_client.post(
            issue_modules_url(workspace.slug, project.id, issue.id),
            {"modules": [str(first_module.id), str(second_module.id)], "removed_modules": []},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ModuleIssue.objects.filter(issue=issue, module=first_module).exists()
        assert not ModuleIssue.objects.filter(issue=issue, module=second_module).exists()

    def test_multiple_module_project_keeps_existing_behavior(
        self, session_client, workspace, module_assignment_context
    ):
        project, issue, first_module, second_module = module_assignment_context
        project.single_module_per_issue = False
        project.save(update_fields=["single_module_per_issue"])

        response = session_client.post(
            issue_modules_url(workspace.slug, project.id, issue.id),
            {"modules": [str(second_module.id)], "removed_modules": []},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert set(ModuleIssue.objects.filter(issue=issue).values_list("module_id", flat=True)) == {
            first_module.id,
            second_module.id,
        }
