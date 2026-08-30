/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function removeIssueIdFromGroup(issueIds: string[], issueId: string): string[] {
  if (!issueIds.includes(issueId)) return issueIds;
  return issueIds.filter((currentIssueId) => currentIssueId !== issueId);
}
