/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
import type { TIssue, TIssueSubIssues } from "@plane/types";
import { EIssueLayoutTypes, EIssueServiceType } from "@plane/types";
import type { IIssueDetail } from "./root.store";
vi.mock("@/lib/store-context", () => ({ rootStore: {} }));

import { IssueSubIssuesStore } from "./sub_issues.store";

const parentIssueId = "parent";
const projectId = "project";
const hierarchyQuery = {
  filters: JSON.stringify({ labels: ["bug"] }),
  layout: EIssueLayoutTypes.GROUPED_SPREADSHEET,
  sub_issue: false,
} as const;

const matchingIssue = { id: "matching", project_id: projectId } as TIssue;
const nonMatchingIssue = { id: "non-matching", project_id: projectId } as TIssue;

function createStore() {
  const addIssue = vi.fn();
  const updateIssue = vi.fn();
  const rootStore = {
    rootIssueStore: {
      issues: {
        addIssue,
        updateIssue,
        issuesMap: { [parentIssueId]: { id: parentIssueId } },
      },
    },
  } as unknown as IIssueDetail;
  const store = new IssueSubIssuesStore(rootStore, EIssueServiceType.ISSUES);
  const subIssues = vi.fn();
  const addSubIssues = vi.fn();
  store.issueService = { subIssues, addSubIssues } as never;

  return { store, addIssue, updateIssue, subIssues, addSubIssues };
}

const response = (subIssues: TIssue[]): TIssueSubIssues => ({
  state_distribution: {
    backlog: [],
    unstarted: [],
    started: [],
    completed: [],
    cancelled: [],
  },
  sub_issues: subIssues,
});

describe("IssueSubIssuesStore query isolation", () => {
  it("keeps filtered hierarchy results isolated from an unfiltered detail fetch", async () => {
    const { store, updateIssue, subIssues } = createStore();
    subIssues
      .mockResolvedValueOnce(response([matchingIssue]))
      .mockResolvedValueOnce(response([matchingIssue, nonMatchingIssue]));

    await store.fetchSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);

    expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual([matchingIssue.id]);
    expect(store.subIssuesByIssueId(parentIssueId)).toBeUndefined();
    expect(updateIssue).not.toHaveBeenCalled();

    await store.fetchSubIssues("workspace", projectId, parentIssueId);

    expect(store.subIssuesByIssueId(parentIssueId)).toEqual([matchingIssue.id, nonMatchingIssue.id]);
    expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual([matchingIssue.id]);
    expect(updateIssue).toHaveBeenCalledWith(parentIssueId, { sub_issues_count: 2 });
  });

  it("invalidates filtered hierarchy results after adding a child", async () => {
    const { store, subIssues, addSubIssues } = createStore();
    subIssues.mockResolvedValue(response([matchingIssue]));
    addSubIssues.mockResolvedValue(response([nonMatchingIssue]));

    await store.fetchSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    await store.createSubIssues("workspace", projectId, parentIssueId, [nonMatchingIssue.id]);

    expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toBeUndefined();
    expect(store.subIssuesByIssueId(parentIssueId)).toEqual([nonMatchingIssue.id]);
  });
});
