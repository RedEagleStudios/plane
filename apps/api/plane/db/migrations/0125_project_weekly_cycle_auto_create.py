# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0124_project_single_module_per_issue"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="weekly_cycle_auto_create",
            field=models.BooleanField(default=False),
        ),
    ]
