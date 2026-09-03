/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TWorkItemFilterExpression } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { getIssueHierarchyFilterQuery, shouldAutoExpandIssueHierarchy } from "./hierarchy-filter";

describe("getIssueHierarchyFilterQuery", () => {
  const filters: TWorkItemFilterExpression = {
    and: [{ label_id__in: "bug-label" }, { state_id__in: "testing-state" }],
  };

  it.each([EIssueLayoutTypes.LIST, EIssueLayoutTypes.SPREADSHEET, EIssueLayoutTypes.GROUPED_SPREADSHEET])(
    "enables descendant matching for %s layouts",
    (layout) => {
      expect(getIssueHierarchyFilterQuery(filters, layout)).toEqual({
        filters: JSON.stringify(filters),
        layout,
        sub_issue: false,
      });
    }
  );

  it("does not alter an unfiltered hierarchy", () => {
    expect(getIssueHierarchyFilterQuery({}, EIssueLayoutTypes.GROUPED_SPREADSHEET)).toBeUndefined();
  });

  it("does not alter layouts that cannot render nested matches", () => {
    expect(getIssueHierarchyFilterQuery(filters, EIssueLayoutTypes.KANBAN)).toBeUndefined();
  });
});

describe("shouldAutoExpandIssueHierarchy", () => {
  const query = getIssueHierarchyFilterQuery({ state_id__in: "testing-state" }, EIssueLayoutTypes.GROUPED_SPREADSHEET);

  it("expands a parent containing filtered descendants", () => {
    expect(shouldAutoExpandIssueHierarchy(query, 1, 0, false)).toBe(true);
  });

  it("does not expand leaves, unsupported depths, or epics", () => {
    expect(shouldAutoExpandIssueHierarchy(query, 0, 0, false)).toBe(false);
    expect(shouldAutoExpandIssueHierarchy(query, 1, 3, false)).toBe(false);
    expect(shouldAutoExpandIssueHierarchy(query, 1, 0, true)).toBe(false);
  });
});
