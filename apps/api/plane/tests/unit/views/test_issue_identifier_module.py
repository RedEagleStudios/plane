# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework.test import APIRequestFactory

from plane.api.views.issue import WorkspaceIssueAPIEndpoint
from plane.db.models import Issue, Module, ModuleIssue, Project


@pytest.mark.unit
@pytest.mark.django_db
def test_identifier_endpoint_expands_assigned_module(workspace, create_user):
    project = Project.objects.create(name="Minecraft", identifier="MKT", workspace=workspace)
    issue = Issue.objects.create(
        name="Discord task preview",
        sequence_id=2969,
        workspace=workspace,
        project=project,
        created_by=create_user,
    )
    module = Module.objects.create(name="Combine Aura", workspace=workspace, project=project)
    ModuleIssue.objects.create(
        issue=issue,
        module=module,
        workspace=workspace,
        project=project,
    )
    request = APIRequestFactory().get("/?fields=id,name,module&expand=module")
    view = WorkspaceIssueAPIEndpoint()
    view.request = request

    response = view.get(
        request,
        slug=workspace.slug,
        project_identifier=project.identifier,
        issue_identifier=str(issue.sequence_id),
    )

    assert response.status_code == 200
    assert response.data["module"] == {
        "id": str(module.id),
        "name": "Combine Aura",
    }
