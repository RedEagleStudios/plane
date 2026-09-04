/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  buildGroupedTableVirtualRows,
  formatEstimateTotal,
  groupedTableGroupTitle,
  sumNumericEstimateValues,
  shouldShowGroupedTableGroup,
  updateExpandedIssueRowKeys,
} from "./utils";

describe("Grouped Table summaries", () => {
  it("sums numeric estimates while ignoring unset and categorical values", () => {
    expect(sumNumericEstimateValues(["1", "9.5", 4, null, undefined, "", "XL"])).toBe(14.5);
    expect(sumNumericEstimateValues([null, undefined, "XL"])).toBeNull();
  });

  it("formats decimal totals without trailing zeroes", () => {
    expect(formatEstimateTotal(93)).toBe("93");
    expect(formatEstimateTotal(8.6)).toBe("8.6");
    expect(formatEstimateTotal(14.5)).toBe("14.5");
  });

  it("names unset cycle and module groups explicitly", () => {
    expect(groupedTableGroupTitle("cycle", "None", "None")).toBe("No Cycle");
    expect(groupedTableGroupTitle("module", "None", "None")).toBe("No Module");
    expect(groupedTableGroupTitle("state", "None", "None")).toBe("None");
    expect(groupedTableGroupTitle("cycle", "cycle-id", "Sprint 117")).toBe("Sprint 117");
  });

  it("keeps the active cycle visible when it has no work items", () => {
    expect(
      shouldShowGroupedTableGroup({
        groupBy: "cycle",
        groupId: "active-cycle",
        cycleStatus: "current",
        issueCount: 0,
        showEmptyGroups: false,
      })
    ).toBe(true);
    expect(
      shouldShowGroupedTableGroup({
        groupBy: "cycle",
        groupId: "completed-cycle",
        cycleStatus: "completed",
        issueCount: 0,
        showEmptyGroups: false,
      })
    ).toBe(false);
    expect(
      shouldShowGroupedTableGroup({
        groupBy: "module",
        groupId: "empty-module",
        issueCount: 0,
        showEmptyGroups: false,
      })
    ).toBe(false);
  });

  it("flattens expanded groups and emits one pagination sentinel per incomplete group", () => {
    expect(
      buildGroupedTableVirtualRows([
        { id: "current", issueIds: ["one", "two"], totalCount: 3, isExpanded: true, isLoadingMore: false },
        { id: "history", issueIds: ["three"], totalCount: 4, isExpanded: false, isLoadingMore: false },
      ])
    ).toEqual([
      { type: "group", key: "group:current", groupId: "current" },
      { type: "issue", key: "issue:current:one", groupId: "current", issueId: "one" },
      { type: "issue", key: "issue:current:two", groupId: "current", issueId: "two" },
      {
        type: "load-more",
        key: "load-more:current:2",
        groupId: "current",
        loadedCount: 2,
        isLoading: false,
      },
      { type: "group", key: "group:history", groupId: "history" },
    ]);
  });

  it("keeps virtual row keys unique when a work item belongs to multiple groups", () => {
    const rows = buildGroupedTableVirtualRows([
      { id: "alpha", issueIds: ["shared"], totalCount: 1, isExpanded: true, isLoadingMore: false },
      { id: "beta", issueIds: ["shared"], totalCount: 1, isExpanded: true, isLoadingMore: false },
    ]);

    expect(rows.map((row) => row.key)).toEqual([
      "group:alpha",
      "issue:alpha:shared",
      "group:beta",
      "issue:beta:shared",
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it("preserves expanded work items outside the virtualized row lifecycle", () => {
    const parentKey = "issue:alpha:parent";
    const childKey = `${parentKey}:child`;
    let expandedKeys = updateExpandedIssueRowKeys(new Set(), parentKey, true);
    expandedKeys = updateExpandedIssueRowKeys(expandedKeys, childKey, true);

    expect(expandedKeys).toEqual(new Set([parentKey, childKey]));
    expect(updateExpandedIssueRowKeys(expandedKeys, parentKey, false)).toEqual(new Set());
  });

  it("marks the pagination sentinel as loading only while its group is fetching", () => {
    expect(
      buildGroupedTableVirtualRows([
        { id: "current", issueIds: ["one"], totalCount: 2, isExpanded: true, isLoadingMore: true },
      ])
    ).toContainEqual({
      type: "load-more",
      key: "load-more:current:1",
      groupId: "current",
      loadedCount: 1,
      isLoading: true,
    });
  });
});
