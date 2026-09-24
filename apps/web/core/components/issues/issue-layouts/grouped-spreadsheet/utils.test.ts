/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { MAX_FILTERED_HIERARCHY_DEPTH } from "../hierarchy-filter";
import {
  buildGroupedTableVirtualRows,
  getGroupedTableVirtualRowHeight,
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
      {
        type: "issue",
        key: "issue:current:one",
        groupId: "current",
        issueId: "one",
        nestingLevel: 0,
        isExpanded: false,
      },
      {
        type: "issue",
        key: "issue:current:two",
        groupId: "current",
        issueId: "two",
        nestingLevel: 0,
        isExpanded: false,
      },
      {
        type: "load-more",
        key: "load-more:current",
        pageKey: "load-more:current:2",
        groupId: "current",
        loadedCount: 2,
        unloadedCount: 1,
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

  it("gives every expanded child its own virtual item independently of its parent's viewport position", () => {
    const childIds = Array.from({ length: 115 }, (_, index) => `child-${index}`);
    const rows = buildGroupedTableVirtualRows(
      [{ id: "current", issueIds: ["parent", "next"], totalCount: 3, isExpanded: true, isLoadingMore: false }],
      {
        getSubIssueIds: (issueId) => (issueId === "parent" ? childIds : []),
        isExpanded: (_issueId, key) => key === "issue:current:parent",
      }
    );
    const childRows = rows.filter((row) => row.type === "issue" && row.nestingLevel === 1);
    expect(childRows.map((row) => row.key)).toEqual(childIds.map((id) => `issue:current:parent:${id}`));
    expect(rows.slice(52, 57).map((row) => row.key)).toEqual(
      childIds.slice(50, 55).map((id) => `issue:current:parent:${id}`)
    );
    expect(rows.at(-2)?.key).toBe("issue:current:next");
    expect(rows.at(-1)).toMatchObject({ type: "load-more", loadedCount: 2, unloadedCount: 1 });
  });

  it("keeps descendants inside their expanded path and group even when the same issue appears twice", () => {
    const children: Record<string, string[]> = { parent: ["child"], child: ["grandchild"] };
    const expandedKeys = new Set(["issue:alpha:parent", "issue:alpha:parent:child", "issue:beta:parent:child"]);
    const groups = [
      { id: "alpha", issueIds: ["parent"], totalCount: 1, isExpanded: true, isLoadingMore: false },
      { id: "beta", issueIds: ["parent"], totalCount: 1, isExpanded: true, isLoadingMore: false },
    ];
    const hierarchy = {
      getSubIssueIds: (issueId: string) => children[issueId],
      isExpanded: (_issueId: string, key: string) => expandedKeys.has(key),
    };
    expect(buildGroupedTableVirtualRows(groups, hierarchy).map((row) => row.key)).toEqual([
      "group:alpha",
      "issue:alpha:parent",
      "issue:alpha:parent:child",
      "issue:alpha:parent:child:grandchild",
      "group:beta",
      "issue:beta:parent",
    ]);
    expandedKeys.delete("issue:alpha:parent");
    expect(buildGroupedTableVirtualRows(groups, hierarchy).map((row) => row.key)).toEqual([
      "group:alpha",
      "issue:alpha:parent",
      "group:beta",
      "issue:beta:parent",
    ]);
    groups[0].isExpanded = false;
    expect(buildGroupedTableVirtualRows(groups, hierarchy).map((row) => row.key)).toEqual([
      "group:alpha",
      "group:beta",
      "issue:beta:parent",
    ]);
  });

  it("bounds hierarchy expansion at the supported depth and rejects ancestry cycles", () => {
    const rows = buildGroupedTableVirtualRows(
      [{ id: "current", issueIds: ["0"], totalCount: 1, isExpanded: true, isLoadingMore: false }],
      {
        getSubIssueIds: (issueId) => ["0", String(Number(issueId) + 1)],
        isExpanded: () => true,
      }
    );
    const issueRows = rows.filter((row) => row.type === "issue");
    expect(issueRows.map((row) => row.issueId)).toEqual(["0", "1", "2", "3"]);
    expect(issueRows.at(-1)).toMatchObject({ nestingLevel: MAX_FILTERED_HIERARCHY_DEPTH, isExpanded: false });
  });

  it("collapses only descendants of the exact expansion path", () => {
    const expandedKeys = new Set([
      "issue:alpha:parent",
      "issue:alpha:parent:child",
      "issue:alpha:parent-other",
      "issue:beta:parent",
    ]);
    expect(updateExpandedIssueRowKeys(expandedKeys, "issue:alpha:parent", false)).toEqual(
      new Set(["issue:alpha:parent-other", "issue:beta:parent"])
    );
  });

  it("reserves stable scroll space while a large group paginates", () => {
    const nextGroupKey = "group:next";
    const getNextGroupOffset = (loadedIssueCount: number) => {
      const rows = buildGroupedTableVirtualRows([
        {
          id: "large",
          issueIds: Array.from({ length: loadedIssueCount }, (_, index) => `issue-${index}`),
          totalCount: 250,
          isExpanded: true,
          isLoadingMore: false,
        },
        { id: "next", issueIds: [], totalCount: 0, isExpanded: false, isLoadingMore: false },
      ]);
      const nextGroupIndex = rows.findIndex((row) => row.key === nextGroupKey);
      return rows
        .slice(0, nextGroupIndex)
        .reduce((offset, row) => offset + getGroupedTableVirtualRowHeight(row, 44), 0);
    };

    expect(getNextGroupOffset(100)).toBe(251 * 44);
    expect(getNextGroupOffset(200)).toBe(251 * 44);
  });

  it("marks the pagination sentinel as loading only while its group is fetching", () => {
    expect(
      buildGroupedTableVirtualRows([
        { id: "current", issueIds: ["one"], totalCount: 2, isExpanded: true, isLoadingMore: true },
      ])
    ).toContainEqual({
      type: "load-more",
      key: "load-more:current",
      pageKey: "load-more:current:1",
      groupId: "current",
      loadedCount: 1,
      unloadedCount: 1,
      isLoading: true,
    });
  });
});
