# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from django.db.models import UUIDField
from django.db.models.expressions import RawSQL


HIERARCHY_FILTER_LAYOUTS = {"list", "spreadsheet", "grouped_spreadsheet"}


def is_hierarchy_filter_request(query_params):
    """Return whether a list request should retain ancestors of filtered matches."""
    if str(query_params.get("sub_issue", "false")).lower() != "false":
        return False
    if query_params.get("layout") not in HIERARCHY_FILTER_LAYOUTS:
        return False

    raw_filters = query_params.get("filters")
    if not raw_filters:
        return False
    if isinstance(raw_filters, dict):
        return bool(raw_filters)

    try:
        return bool(json.loads(raw_filters))
    except (TypeError, json.JSONDecodeError):
        # The filter backend owns validation. Keep hierarchy mode enabled so it
        # can return the existing invalid-filter response instead of changing semantics.
        return True


def issue_ancestor_ids(matching_queryset, accessible_queryset):
    """Build a recursive SQL expression containing matches and their accessible ancestors."""
    matching_sql, matching_params = matching_queryset.order_by().values("id", "parent_id").query.sql_with_params()
    accessible_sql, accessible_params = accessible_queryset.order_by().values("id", "parent_id").query.sql_with_params()

    sql = f"""
        WITH RECURSIVE issue_ancestors(id, parent_id) AS (
            SELECT matching_issue.id, matching_issue.parent_id
            FROM ({matching_sql}) AS matching_issue
            UNION
            SELECT parent_issue.id, parent_issue.parent_id
            FROM ({accessible_sql}) AS parent_issue
            INNER JOIN issue_ancestors
                ON issue_ancestors.parent_id = parent_issue.id
        )
        SELECT id FROM issue_ancestors
    """
    return RawSQL(sql, (*matching_params, *accessible_params), output_field=UUIDField())
