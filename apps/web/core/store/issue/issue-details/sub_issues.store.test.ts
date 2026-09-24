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
    const { store, subIssues } = createStore();
    subIssues
      .mockResolvedValueOnce(response([matchingIssue]))
      .mockResolvedValueOnce(response([matchingIssue, nonMatchingIssue]));

    await store.fetchSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);

    expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual([matchingIssue.id]);
    expect(store.subIssuesByIssueId(parentIssueId)).toBeUndefined();

    await store.fetchSubIssues("workspace", projectId, parentIssueId);

    expect(store.subIssuesByIssueId(parentIssueId)).toEqual([matchingIssue.id, nonMatchingIssue.id]);
    expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual([matchingIssue.id]);
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

describe("expanded sub-issue freshness", () => {
  it("refreshes on focus or becoming visible and detaches listeners when the view closes", async () => {
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("document", documentTarget);
    const { store, subIssues } = createStore();
    subIssues.mockResolvedValue(response([matchingIssue]));
    const unsubscribe = store.subscribeToSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    try {
      documentTarget.dispatchEvent(new Event("visibilitychange"));
      expect(subIssues).not.toHaveBeenCalled();
      documentTarget.visibilityState = "visible";
      documentTarget.dispatchEvent(new Event("visibilitychange"));
      windowTarget.dispatchEvent(new Event("focus"));
      await store.refreshSubscribedSubIssues("workspace");
      expect(subIssues).toHaveBeenCalledTimes(1);
      expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual(["matching"]);

      unsubscribe();
      subIssues.mockClear();
      windowTarget.dispatchEvent(new Event("focus"));
      documentTarget.dispatchEvent(new Event("visibilitychange"));
      expect(subIssues).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      vi.unstubAllGlobals();
    }
  });

  it("refreshes subscribed filtered children without replacing them with sidebar results", async () => {
    const { store, subIssues } = createStore();
    const addedIssue = { id: "added-remotely", project_id: projectId } as TIssue;
    subIssues
      .mockResolvedValueOnce(response([matchingIssue]))
      .mockResolvedValueOnce(response([matchingIssue, addedIssue, nonMatchingIssue]))
      .mockResolvedValueOnce(response([matchingIssue, addedIssue]));

    await store.fetchSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    const unsubscribe = store.subscribeToSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    try {
      await store.fetchSubIssues("workspace", projectId, parentIssueId);
      await store.refreshSubscribedSubIssues("workspace", projectId);

      expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual(["matching", "added-remotely"]);
      expect(store.subIssuesByIssueId(parentIssueId)).toEqual(["matching", "added-remotely", "non-matching"]);
      expect(subIssues).toHaveBeenLastCalledWith("workspace", projectId, parentIssueId, hierarchyQuery);
    } finally {
      unsubscribe();
    }
  });

  it("keeps shared subscriptions active until the last consumer closes and isolates workspaces", async () => {
    const { store, subIssues } = createStore();
    subIssues.mockResolvedValue(response([matchingIssue]));
    const closeFirst = store.subscribeToSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    const closeSecond = store.subscribeToSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    try {
      closeFirst();
      await store.refreshSubscribedSubIssues("other-workspace");
      await store.refreshSubscribedSubIssues("workspace", "other-project");
      expect(subIssues).not.toHaveBeenCalled();
      await store.refreshSubscribedSubIssues("workspace", projectId);
      expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual(["matching"]);
      closeSecond();
      subIssues.mockClear();
      await store.refreshSubscribedSubIssues("workspace");
      expect(subIssues).not.toHaveBeenCalled();
    } finally {
      closeFirst();
      closeSecond();
    }
  });

  it("coalesces overlapping refreshes and permits retry after failure without discarding cached rows", async () => {
    const { store, subIssues } = createStore();
    subIssues.mockResolvedValueOnce(response([matchingIssue]));
    await store.fetchSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    const unsubscribe = store.subscribeToSubIssues("workspace", projectId, parentIssueId, hierarchyQuery);
    let rejectRequest!: (error: Error) => void;
    subIssues.mockImplementationOnce(
      () =>
        new Promise<TIssueSubIssues>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    try {
      const first = store.refreshSubscribedSubIssues("workspace");
      const second = store.refreshSubscribedSubIssues("workspace");
      const results = Promise.allSettled([first, second]);
      expect(subIssues).toHaveBeenCalledTimes(2);
      rejectRequest(new Error("offline"));
      expect((await results).map((result) => result.status)).toEqual(["rejected", "rejected"]);
      expect(store.loader).toBeUndefined();
      expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual(["matching"]);

      subIssues.mockResolvedValueOnce(response([]));
      await store.refreshSubscribedSubIssues("workspace");
      expect(store.subIssuesByIssueId(parentIssueId, hierarchyQuery)).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});
