/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkItemFilterExpression } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";

const HIERARCHY_FILTER_LAYOUTS: Partial<Record<EIssueLayoutTypes, true>> = {
  [EIssueLayoutTypes.LIST]: true,
  [EIssueLayoutTypes.SPREADSHEET]: true,
  [EIssueLayoutTypes.GROUPED_SPREADSHEET]: true,
};

type TIssueHierarchyFilterQuery = {
  filters: string;
  layout: EIssueLayoutTypes;
  sub_issue: false;
};

export const MAX_FILTERED_HIERARCHY_DEPTH = 3;

export function getIssueHierarchyFilterQuery(
  filters: TWorkItemFilterExpression | undefined,
  layout: EIssueLayoutTypes | undefined
): TIssueHierarchyFilterQuery | undefined {
  if (!filters || Object.keys(filters).length === 0 || !layout || !HIERARCHY_FILTER_LAYOUTS[layout]) return undefined;

  return {
    filters: JSON.stringify(filters),
    layout,
    sub_issue: false,
  };
}

export function shouldAutoExpandIssueHierarchy(
  query: TIssueHierarchyFilterQuery | undefined,
  subIssuesCount: number,
  nestingLevel: number,
  isEpic: boolean
): boolean {
  return !!query && subIssuesCount > 0 && nestingLevel < MAX_FILTERED_HIERARCHY_DEPTH && !isEpic;
}
