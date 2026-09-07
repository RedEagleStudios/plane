# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .issue import IssueStateSerializer
from plane.db.models import Cycle, CycleIssue, CycleUserProperties
from plane.utils.timezone_converter import convert_to_utc
from plane.utils.cycle_backfill import can_edit_cycle, validate_cycle_dates


class CycleWriteSerializer(BaseSerializer):
    def validate(self, data):
        project_id = (self.instance and self.instance.project_id) or self.context.get("project_id")
        for field in ("start_date", "end_date"):
            if data.get(field) is not None:
                data[field] = convert_to_utc(
                    date=str(data[field].date()),
                    project_id=project_id,
                    is_start_date=field == "start_date",
                )
        validate_cycle_dates(self.instance, data)
        return data

    class Meta:
        model = Cycle
        fields = "__all__"
        read_only_fields = ["workspace", "project", "owned_by", "archived_at", "progress_snapshot"]


class CycleSerializer(BaseSerializer):
    # favorite
    is_favorite = serializers.BooleanField(read_only=True)
    total_issues = serializers.IntegerField(read_only=True)
    # state group wise distribution
    cancelled_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    started_issues = serializers.IntegerField(read_only=True)
    unstarted_issues = serializers.IntegerField(read_only=True)
    backlog_issues = serializers.IntegerField(read_only=True)

    # active | draft | upcoming | completed
    status = serializers.CharField(read_only=True)
    is_editable = serializers.SerializerMethodField()

    def get_is_editable(self, obj):
        return obj.is_editable if hasattr(obj, "is_editable") else can_edit_cycle(obj)

    def to_representation(self, instance):
        from plane.utils.cycle_snapshot import public_snapshot

        data = super().to_representation(instance)
        if "progress_snapshot" in data:
            data["progress_snapshot"] = public_snapshot(data["progress_snapshot"])
        return data

    class Meta:
        model = Cycle
        fields = [
            # necessary fields
            "id",
            "workspace_id",
            "project_id",
            # model fields
            "name",
            "description",
            "start_date",
            "end_date",
            "owned_by_id",
            "view_props",
            "sort_order",
            "external_source",
            "external_id",
            "progress_snapshot",
            "logo_props",
            # meta fields
            "is_favorite",
            "total_issues",
            "cancelled_issues",
            "completed_issues",
            "started_issues",
            "unstarted_issues",
            "backlog_issues",
            "status",
            "is_editable",
        ]
        read_only_fields = fields


class CycleIssueSerializer(BaseSerializer):
    issue_detail = IssueStateSerializer(read_only=True, source="issue")
    sub_issues_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CycleIssue
        fields = "__all__"
        read_only_fields = ["workspace", "project", "cycle"]


class CycleUserPropertiesSerializer(BaseSerializer):
    class Meta:
        model = CycleUserProperties
        fields = "__all__"
        read_only_fields = ["workspace", "project", "cycle", "user"]
