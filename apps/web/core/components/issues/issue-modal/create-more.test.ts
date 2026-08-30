/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { getCreateMoreFormValues } from "./create-more";

describe("Create more form values", () => {
  it("preserves selected properties while clearing identity and text", () => {
    expect(
      getCreateMoreFormValues({
        id: "created-issue-id",
        sourceIssueId: "source-issue-id",
        project_id: "project-id",
        type_id: "type-id",
        name: "First work item",
        description_html: "<p>First description</p>",
        state_id: "state-id",
        priority: "high",
        assignee_ids: ["assignee-id"],
        label_ids: ["label-id"],
        start_date: "2026-08-30",
        target_date: "2026-09-01",
        cycle_id: "cycle-id",
        module_ids: ["module-id"],
        estimate_point: "estimate-id",
        parent_id: "parent-id",
      })
    ).toEqual({
      project_id: "project-id",
      type_id: "type-id",
      name: "",
      description_html: "<p></p>",
      state_id: "state-id",
      priority: "high",
      assignee_ids: ["assignee-id"],
      label_ids: ["label-id"],
      start_date: "2026-08-30",
      target_date: "2026-09-01",
      cycle_id: "cycle-id",
      module_ids: ["module-id"],
      estimate_point: "estimate-id",
      parent_id: "parent-id",
    });
  });
});
