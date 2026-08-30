/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Placement } from "@popperjs/core";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
export const QUICK_ADD_DROPDOWN_PLACEMENT: Placement = "top-start";

export function getRepeatedQuickAddValues(values: Partial<TIssue>): Partial<TIssue> {
  return {
    ...values,
    name: "",
    description_html: "<p></p>",
  };
}

type FinalizeQuickAddAssetsArgs = {
  assetIds: string[];
  createdIssue: Pick<TIssue, "id" | "project_id">;
  fallbackProjectId: string;
  workspaceSlug: string;
  updateAssets: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { asset_ids: string[] }
  ) => Promise<unknown>;
};

export async function finalizeQuickAddAssets(args: FinalizeQuickAddAssetsArgs): Promise<void> {
  const { assetIds, createdIssue, fallbackProjectId, workspaceSlug, updateAssets } = args;
  if (assetIds.length === 0) return;

  await updateAssets(workspaceSlug, createdIssue.project_id ?? fallbackProjectId, createdIssue.id, {
    asset_ids: assetIds,
  });
}

export function isQuickAddEditableProperty(property: keyof IIssueDisplayProperties): boolean {
  switch (property) {
    case "state":
    case "priority":
    case "assignee":
    case "labels":
    case "modules":
    case "cycle":
    case "start_date":
    case "due_date":
    case "estimate":
      return true;
    default:
      return false;
  }
}
