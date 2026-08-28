/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueGroupByOptions } from "@plane/types";

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
