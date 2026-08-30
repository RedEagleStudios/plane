/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  getRepeatedQuickAddValues,
  isQuickAddEditableProperty,
  plainTextToDescriptionHtml,
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

  it("converts inline description text to safe work-item HTML", () => {
    expect(plainTextToDescriptionHtml("First line\n\n<script>alert('x')</script>")).toBe(
      "<p>First line</p><p><br></p><p>&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt;</p>"
    );
    expect(plainTextToDescriptionHtml("   ")).toBe("<p></p>");
  });
});
