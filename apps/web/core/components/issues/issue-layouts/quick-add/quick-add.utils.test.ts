/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
import {
  finalizeQuickAddAssets,
  getRepeatedQuickAddValues,
  isQuickAddEditableProperty,
  QUICK_ADD_DROPDOWN_PLACEMENT,
} from "./quick-add.utils";

describe("Advanced spreadsheet quick add", () => {
  it("preserves selected column values between submissions while clearing text", () => {
    expect(
      getRepeatedQuickAddValues({
        name: "First work item",
        description_html: "<p>Description</p>",
        state_id: "state-id",
        priority: "high",
        assignee_ids: ["assignee-id"],
        label_ids: ["label-id"],
        module_ids: ["module-id"],
        cycle_id: "cycle-id",
        start_date: "2026-08-30",
        target_date: "2026-09-01",
        estimate_point: "estimate-id",
      })
    ).toEqual({
      name: "",
      description_html: "<p></p>",
      state_id: "state-id",
      priority: "high",
      assignee_ids: ["assignee-id"],
      label_ids: ["label-id"],
      module_ids: ["module-id"],
      cycle_id: "cycle-id",
      start_date: "2026-08-30",
      target_date: "2026-09-01",
      estimate_point: "estimate-id",
    });
  });

  it("only treats pre-creation properties as editable", () => {
    expect(isQuickAddEditableProperty("state")).toBe(true);
    expect(isQuickAddEditableProperty("modules")).toBe(true);
    expect(isQuickAddEditableProperty("created_on")).toBe(false);
    expect(isQuickAddEditableProperty("updated_on")).toBe(false);
    expect(isQuickAddEditableProperty("attachment_count")).toBe(false);
  });

  it("opens footer dropdowns above their controls", () => {
    expect(QUICK_ADD_DROPDOWN_PLACEMENT).toBe("top-start");
  });

  it("attaches pre-creation uploads to the created work item", async () => {
    const updateAssets = vi.fn().mockResolvedValue(undefined);

    await finalizeQuickAddAssets({
      assetIds: ["asset-one", "asset-two"],
      createdIssue: { id: "issue-id", project_id: "project-id" },
      fallbackProjectId: "fallback-project-id",
      workspaceSlug: "workspace",
      updateAssets,
    });

    expect(updateAssets).toHaveBeenCalledWith("workspace", "project-id", "issue-id", {
      asset_ids: ["asset-one", "asset-two"],
    });
  });
});
