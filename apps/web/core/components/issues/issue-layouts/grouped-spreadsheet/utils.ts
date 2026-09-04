/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueGroupByOptions } from "@plane/types";

export const GROUPED_TABLE_PAGE_SIZE = 100;

export interface GroupedTableVirtualGroup {
  id: string;
  issueIds: string[];
  totalCount: number;
  isExpanded: boolean;
  isLoadingMore: boolean;
}

export type GroupedTableVirtualRow =
  | { type: "group"; key: string; groupId: string }
  | { type: "issue"; key: string; groupId: string; issueId: string }
  | {
      type: "load-more";
      key: string;
      pageKey: string;
      groupId: string;
      loadedCount: number;
      unloadedCount: number;
      isLoading: boolean;
    };

type GroupVisibilityOptions = {
  cycleStatus?: string | null;
  groupBy: TIssueGroupByOptions | null;
  groupId: string;
  issueCount: number;
  showEmptyGroups: boolean;
};

export function shouldShowGroupedTableGroup(options: GroupVisibilityOptions): boolean {
  const { cycleStatus, groupBy, groupId, issueCount, showEmptyGroups } = options;
  if (showEmptyGroups) return true;
  if (groupBy === "cycle" && groupId !== "None" && cycleStatus?.toLowerCase() === "current") return true;
  return issueCount > 0;
}

export function buildGroupedTableVirtualRows(groups: GroupedTableVirtualGroup[]): GroupedTableVirtualRow[] {
  const rows: GroupedTableVirtualRow[] = [];

  for (const group of groups) {
    rows.push({ type: "group", key: `group:${group.id}`, groupId: group.id });
    if (!group.isExpanded) continue;

    for (const issueId of group.issueIds) {
      rows.push({ type: "issue", key: `issue:${group.id}:${issueId}`, groupId: group.id, issueId });
    }

    if (group.issueIds.length < group.totalCount) {
      rows.push({
        type: "load-more",
        key: `load-more:${group.id}`,
        pageKey: `load-more:${group.id}:${group.issueIds.length}`,
        groupId: group.id,
        loadedCount: group.issueIds.length,
        unloadedCount: group.totalCount - group.issueIds.length,
        isLoading: group.isLoadingMore,
      });
    }
  }

  return rows;
}

export function getGroupedTableVirtualRowHeight(row: GroupedTableVirtualRow, rowHeight: number): number {
  return row.type === "load-more" ? row.unloadedCount * rowHeight : rowHeight;
}

export function updateExpandedIssueRowKeys(
  currentKeys: ReadonlySet<string>,
  expansionKey: string,
  isExpanded: boolean
): ReadonlySet<string> {
  const nextKeys = new Set(currentKeys);
  if (isExpanded) {
    nextKeys.add(expansionKey);
    return nextKeys;
  }

  for (const key of nextKeys) {
    if (key === expansionKey || key.startsWith(`${expansionKey}:`)) nextKeys.delete(key);
  }
  return nextKeys;
}

export function sumNumericEstimateValues(values: (string | number | null | undefined)[]): number | null {
  let total = 0;
  let numericValueCount = 0;

  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) continue;
    total += numericValue;
    numericValueCount += 1;
  }

  return numericValueCount > 0 ? total : null;
}

export function formatEstimateTotal(total: number): string {
  return Number.isInteger(total) ? total.toString() : total.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function groupedTableGroupTitle(groupBy: TIssueGroupByOptions | null, groupId: string, name: string): string {
  if (groupId !== "None") return name;
  if (groupBy === "cycle") return "No Cycle";
  if (groupBy === "module") return "No Module";
  return "None";
}
