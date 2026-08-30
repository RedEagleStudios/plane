# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0125_project_weekly_cycle_auto_create"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="weekly_cycle_start_weekday",
            field=models.PositiveSmallIntegerField(
                default=5,
                validators=[MinValueValidator(0), MaxValueValidator(6)],
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="weekly_cycle_duration_days",
            field=models.PositiveSmallIntegerField(
                default=7,
                validators=[MinValueValidator(1), MaxValueValidator(90)],
            ),
        ),
    ]
