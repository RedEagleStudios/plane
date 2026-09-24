/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ALL_ISSUES } from "@plane/constants";
import type { IGroupByColumn, TIssue, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";

type TSubIssueVirtualGroup = {
  group: IGroupByColumn;
  issueIds: readonly string[];
  isExpanded: boolean;
};

export type TSubIssueVirtualRow =
  | {
      type: "group";
      key: string;
      group: IGroupByColumn;
      count: number;
      isExpanded: boolean;
    }
  | {
      type: "issue";
      key: string;
      issueId: string;
      parentIssueId: string;
      projectId: string;
      spacingLeft: number;
      expandedProjectId: string | undefined;
      issueServiceType: TIssueServiceType;
    };

type TSubIssueVirtualRowsOptions = {
  groups: TSubIssueVirtualGroup[];
  parentIssueId: string;
  rootIssueId: string;
  projectId: string;
  spacingLeft: number;
  issueServiceType: TIssueServiceType;
  getIssue: (
    issueId: string,
    serviceType: TIssueServiceType
  ) => Pick<TIssue, "project_id" | "sub_issues_count"> | undefined;
  getChildIds: (issueId: string) => readonly string[] | undefined;
  getExpandedIssueIds: (parentIssueId: string) => readonly string[];
};

export function buildSubIssueVirtualRows(options: TSubIssueVirtualRowsOptions): TSubIssueVirtualRow[] {
  const { groups, rootIssueId, getIssue, getChildIds, getExpandedIssueIds } = options;
  const rows: TSubIssueVirtualRow[] = [];
  const ancestors = new Set<string>();

  const appendIssues = (
    issueIds: readonly string[],
    parentIssueId: string,
    projectId: string,
    spacingLeft: number,
    issueServiceType: TIssueServiceType,
    parentKey: string
  ) => {
    const expandedIds = new Set(getExpandedIssueIds(parentIssueId));
    for (const issueId of issueIds) {
      if (ancestors.has(issueId)) continue;
      const issue = getIssue(issueId, issueServiceType);
      if (!issue) continue;
      const key = `${parentKey}:${issueId}`;
      const expandedProjectId =
        issueId !== rootIssueId && expandedIds.has(issueId) && issue.sub_issues_count
          ? (issue.project_id ?? undefined)
          : undefined;
      rows.push({
        type: "issue",
        key,
        issueId,
        parentIssueId,
        projectId,
        spacingLeft,
        issueServiceType,
        expandedProjectId,
      });
      if (!expandedProjectId) continue;
      ancestors.add(issueId);
      appendIssues(
        getChildIds(issueId) ?? [],
        issueId,
        expandedProjectId,
        spacingLeft + 22,
        EIssueServiceType.ISSUES,
        key
      );
      ancestors.delete(issueId);
    }
  };

  for (const { group, issueIds, isExpanded } of groups) {
    if (issueIds.length === 0) continue;
    if (group.id !== ALL_ISSUES) {
      rows.push({ type: "group", key: `group:${group.id}`, group, count: issueIds.length, isExpanded });
    }
    if (!isExpanded) continue;
    appendIssues(
      issueIds,
      options.parentIssueId,
      options.projectId,
      options.spacingLeft,
      options.issueServiceType,
      `issue:${group.id}`
    );
  }

  return rows;
}
