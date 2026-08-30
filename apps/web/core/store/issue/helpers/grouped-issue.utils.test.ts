/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { removeIssueIdFromGroup } from "./grouped-issue.utils";

describe("Grouped work-item membership", () => {
  it("returns a new group list without the removed work item", () => {
    const issueIds = ["other-issue", "multi-module-issue"];
    const updatedIssueIds = removeIssueIdFromGroup(issueIds, "multi-module-issue");

    expect(updatedIssueIds).toEqual(["other-issue"]);
    expect(updatedIssueIds).not.toBe(issueIds);
    expect(issueIds).toEqual(["other-issue", "multi-module-issue"]);
  });

  it("keeps the existing reference when the work item is not in the group", () => {
    const issueIds = ["other-issue"];
    expect(removeIssueIdFromGroup(issueIds, "missing-issue")).toBe(issueIds);
  });
});
