# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import Cycle


class CycleBaseSerializer(BaseSerializer):
    def to_representation(self, instance):
        from plane.utils.cycle_snapshot import public_snapshot

        data = super().to_representation(instance)
        if "progress_snapshot" in data:
            data["progress_snapshot"] = public_snapshot(data["progress_snapshot"])
        return data

    class Meta:
        model = Cycle
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
