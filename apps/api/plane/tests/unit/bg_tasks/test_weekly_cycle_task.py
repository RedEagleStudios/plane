# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from plane.bgtasks.weekly_cycle_task import (
    create_next_weekly_cycle,
    increment_cycle_name,
    weekly_cycle_window,
)
from plane.db.models import Cycle, Project, ProjectMember


def test_increment_cycle_name_uses_trailing_number():
    assert increment_cycle_name("Sprint 1") == "Sprint 2"
    assert increment_cycle_name("Sprint 009") == "Sprint 010"
    assert increment_cycle_name("Release") == "Release 1"


def test_weekly_cycle_window_runs_saturday_through_friday_in_project_timezone():
    start_at, end_at = weekly_cycle_window(date(2026, 9, 4), "Asia/Jakarta")

    assert start_at.astimezone(ZoneInfo("Asia/Jakarta")) == datetime(
        2026, 9, 5, 0, 0, 1, tzinfo=ZoneInfo("Asia/Jakarta")
    )
    assert end_at.astimezone(ZoneInfo("Asia/Jakarta")) == datetime(
        2026, 9, 11, 23, 59, tzinfo=ZoneInfo("Asia/Jakarta")
    )


@pytest.fixture
def automated_cycle_project(db, workspace, create_user):
    project = Project.objects.create(
        name="Automated Cycles",
        identifier="ACY",
        workspace=workspace,
        created_by=create_user,
        project_lead=create_user,
        cycle_view=True,
        weekly_cycle_auto_create=True,
        timezone="Asia/Jakarta",
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    Cycle.objects.create(
        name="Sprint 117",
        project=project,
        workspace=workspace,
        owned_by=create_user,
        timezone="Asia/Jakarta",
        start_date=datetime(2026, 8, 22, 0, 0, 1, tzinfo=ZoneInfo("Asia/Jakarta")),
        end_date=datetime(2026, 8, 28, 23, 59, tzinfo=ZoneInfo("Asia/Jakarta")),
        created_by=create_user,
    )
    return project


@pytest.mark.django_db
class TestCreateNextWeeklyCycle:
    def test_creates_incremented_cycle_once(self, automated_cycle_project):
        created_cycle = create_next_weekly_cycle(automated_cycle_project.id, date(2026, 9, 4))

        assert created_cycle is not None
        assert created_cycle.name == "Sprint 118"
        assert created_cycle.start_date.astimezone(ZoneInfo("Asia/Jakarta")).date() == date(2026, 9, 5)
        assert created_cycle.end_date.astimezone(ZoneInfo("Asia/Jakarta")).date() == date(2026, 9, 11)
        assert created_cycle.external_source == "weekly-cycle-automation"

        assert create_next_weekly_cycle(automated_cycle_project.id, date(2026, 9, 4)) is None
        assert Cycle.objects.filter(project=automated_cycle_project, name="Sprint 118").count() == 1

    def test_skips_non_friday_runs(self, automated_cycle_project):
        assert create_next_weekly_cycle(automated_cycle_project.id, date(2026, 9, 3)) is None
        assert Cycle.objects.filter(project=automated_cycle_project).count() == 1

    def test_created_dates_are_timezone_aware(self, automated_cycle_project):
        created_cycle = create_next_weekly_cycle(automated_cycle_project.id, date(2026, 9, 4))
        assert created_cycle is not None
        assert created_cycle.start_date.tzinfo is not None
        assert created_cycle.start_date.astimezone(UTC).tzinfo is UTC
