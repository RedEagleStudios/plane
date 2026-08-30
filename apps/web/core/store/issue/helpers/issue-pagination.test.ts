/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { EIssueLayoutTypes } from "@plane/types";
import { getIssueLayoutGroupBy } from "./issue-pagination";

describe("Issue pagination grouping", () => {
  it("uses the selected group for grouped spreadsheet pagination", () => {
    expect(getIssueLayoutGroupBy(EIssueLayoutTypes.GROUPED_SPREADSHEET, "cycle")).toBe("cycle");
  });

  it("keeps ungrouped spreadsheet pagination ungrouped", () => {
    expect(getIssueLayoutGroupBy(EIssueLayoutTypes.SPREADSHEET, "cycle")).toBeUndefined();
  });
});
