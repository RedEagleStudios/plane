/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueGroupByOptions } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";

export function getIssueLayoutGroupBy(
  layout: EIssueLayoutTypes | undefined,
  groupBy: TIssueGroupByOptions | null | undefined
): TIssueGroupByOptions | undefined {
  switch (layout) {
    case EIssueLayoutTypes.CALENDAR:
      return "target_date";
    case EIssueLayoutTypes.LIST:
    case EIssueLayoutTypes.KANBAN:
    case EIssueLayoutTypes.GROUPED_SPREADSHEET:
      return groupBy ?? undefined;
    default:
      return undefined;
  }
}
