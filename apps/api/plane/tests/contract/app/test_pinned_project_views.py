# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import IssueView, Project, ProjectMember, User, WorkspaceMember


def _pin_url(workspace_slug, project_id, view_id):
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/views/{view_id}/pin/"


def _pinned_views_url(workspace_slug, project_id):
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/views/pinned/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Pinned views project",
        identifier="PIN",
        workspace=workspace,
        created_by=create_user,
        issue_views_view=True,
    )
    ProjectMember.objects.create(
        workspace=workspace,
        project=project,
        member=create_user,
        role=20,
        is_active=True,
    )
    return project


@pytest.fixture
def public_view(db, workspace, project, create_user):
    return IssueView.objects.create(
        name="Team estimation",
        description="Shared estimation view",
        filters={},
        access=1,
        owned_by=create_user,
        project=project,
        workspace=workspace,
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestPinnedProjectViews:
    def test_admin_can_pin_public_view_for_project_members(self, session_client, workspace, project, public_view):
        response = session_client.patch(
            _pin_url(workspace.slug, project.id, public_view.id),
            {"is_pinned": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_pinned"] is True
        public_view.refresh_from_db()
        assert public_view.is_pinned is True

        list_response = session_client.get(_pinned_views_url(workspace.slug, project.id))
        assert list_response.status_code == status.HTTP_200_OK
        assert [view["id"] for view in list_response.data] == [public_view.id]

    def test_private_view_cannot_be_pinned(self, session_client, workspace, project, create_user):
        private_view = IssueView.objects.create(
            name="Private view",
            description="",
            filters={},
            access=0,
            owned_by=create_user,
            project=project,
            workspace=workspace,
        )

        response = session_client.patch(
            _pin_url(workspace.slug, project.id, private_view.id),
            {"is_pinned": True},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        private_view.refresh_from_db()
        assert private_view.is_pinned is False

    def test_non_admin_cannot_change_project_pin(self, session_client, workspace, project, public_view):
        member = User.objects.create_user(email="member@example.com", username="member")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        ProjectMember.objects.create(
            workspace=workspace,
            project=project,
            member=member,
            role=15,
            is_active=True,
        )
        session_client.force_authenticate(user=member)

        response = session_client.patch(
            _pin_url(workspace.slug, project.id, public_view.id),
            {"is_pinned": True},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        public_view.refresh_from_db()
        assert public_view.is_pinned is False
