# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework.exceptions import ValidationError

from plane.db.models import Estimate, EstimatePoint, Issue
from plane.tests.factories import ProjectFactory
from plane.utils.build_chart import build_analytics_chart


@pytest.mark.unit
@pytest.mark.django_db
class TestBuildAnalyticsChart:
    def test_sums_estimate_points_by_x_axis(self):
        project = ProjectFactory()
        estimate = Estimate.objects.create(
            name="Points",
            type="points",
            project=project,
            workspace=project.workspace,
        )
        three_points = EstimatePoint.objects.create(
            estimate=estimate,
            key=3,
            value="3",
            project=project,
            workspace=project.workspace,
        )
        five_points = EstimatePoint.objects.create(
            estimate=estimate,
            key=5,
            value="5",
            project=project,
            workspace=project.workspace,
        )
        Issue.objects.bulk_create(
            [
                Issue(
                    name="Three-point work item",
                    priority="high",
                    estimate_point=three_points,
                    project=project,
                    workspace=project.workspace,
                ),
                Issue(
                    name="Five-point work item",
                    priority="high",
                    estimate_point=five_points,
                    project=project,
                    workspace=project.workspace,
                ),
                Issue(
                    name="Unestimated work item",
                    priority="low",
                    project=project,
                    workspace=project.workspace,
                ),
            ]
        )

        chart = build_analytics_chart(
            Issue.issue_objects.filter(project=project),
            "PRIORITY",
            "ESTIMATE_POINT_COUNT",
        )

        assert chart == {
            "data": [
                {"key": "high", "name": "high", "count": 8.0},
                {"key": "low", "name": "low", "count": 0.0},
            ],
            "schema": {},
        }

    def test_rejects_unknown_y_axis_metric(self):
        project = ProjectFactory()

        with pytest.raises(ValidationError, match="Invalid y_axis metric"):
            build_analytics_chart(Issue.issue_objects.filter(project=project), "PRIORITY", "UNKNOWN")
