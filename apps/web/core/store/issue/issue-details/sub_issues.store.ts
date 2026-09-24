/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { pull, concat, uniq, set, update } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";

// Plane Imports
import type {
  TIssue,
  TIssueParams,
  TIssueSubIssues,
  TIssueSubIssuesStateDistributionMap,
  TIssueSubIssuesIdMap,
  TSubIssuesStateDistribution,
  TIssueServiceType,
  TLoader,
} from "@plane/types";
// services
import { IssueService } from "@/services/issue";
// store
import type { IIssueDetail } from "./root.store";
import type { IWorkItemSubIssueFiltersStore } from "./sub_issues_filter.store";
import { WorkItemSubIssueFiltersStore } from "./sub_issues_filter.store";
type TSubIssueQuery = Partial<Record<TIssueParams, string | boolean>>;
type TFilteredSubIssuesIdMap = Record<string, Record<string, string[]>>;
type TSubIssueSubscription = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  queries?: TSubIssueQuery;
  subscribers: number;
};

const getSubIssueQueryKey = (queries?: TSubIssueQuery) => {
  if (!queries || Object.keys(queries).length === 0) return undefined;

  const queryKey = new URLSearchParams();
  for (const [key, value] of Object.entries(queries)) queryKey.set(key, String(value));
  queryKey.sort();
  return queryKey.toString();
};

export interface IIssueSubIssuesStoreActions {
  fetchSubIssues: (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    queries?: Partial<Record<TIssueParams, string | boolean>>
  ) => Promise<TIssueSubIssues>;
  createSubIssues: (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    issueIds: string[]
  ) => Promise<void>;
  updateSubIssue: (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    issueId: string,
    issueData: Partial<TIssue>,
    oldIssue?: Partial<TIssue>,
    fromModal?: boolean
  ) => Promise<void>;
  removeSubIssue: (workspaceSlug: string, projectId: string, parentIssueId: string, issueId: string) => Promise<void>;
  deleteSubIssue: (workspaceSlug: string, projectId: string, parentIssueId: string, issueId: string) => Promise<void>;
}

type TSubIssueHelpersKeys = "issue_visibility" | "preview_loader" | "issue_loader";
type TSubIssueHelpers = Record<TSubIssueHelpersKeys, string[]>;
export interface IIssueSubIssuesStore extends IIssueSubIssuesStoreActions {
  // observables
  subIssuesStateDistribution: TIssueSubIssuesStateDistributionMap;
  subIssues: TIssueSubIssuesIdMap;
  filteredSubIssues: TFilteredSubIssuesIdMap;
  subIssueHelpers: Record<string, TSubIssueHelpers>; // parent_issue_id -> TSubIssueHelpers
  loader: TLoader;
  filters: IWorkItemSubIssueFiltersStore;
  // helper methods
  stateDistributionByIssueId: (issueId: string) => TSubIssuesStateDistribution | undefined;
  subIssuesByIssueId: (issueId: string, queries?: TSubIssueQuery) => string[] | undefined;
  subIssueHelpersByIssueId: (issueId: string) => TSubIssueHelpers;
  subscribeToSubIssues: (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    queries?: TSubIssueQuery
  ) => () => void;
  refreshSubscribedSubIssues: (workspaceSlug: string, projectId?: string) => Promise<void>;
  // actions
  fetchOtherProjectProperties: (workspaceSlug: string, projectIds: string[]) => Promise<void>;
  setSubIssueHelpers: (parentIssueId: string, key: TSubIssueHelpersKeys, value: string) => void;
}

export class IssueSubIssuesStore implements IIssueSubIssuesStore {
  // observables
  subIssuesStateDistribution: TIssueSubIssuesStateDistributionMap = {};
  subIssues: TIssueSubIssuesIdMap = {};
  filteredSubIssues: TFilteredSubIssuesIdMap = {};
  subIssueHelpers: Record<string, TSubIssueHelpers> = {};
  loader: TLoader = undefined;
  private readonly subscriptions = new Map<string, TSubIssueSubscription>();
  private readonly pendingRequests = new Map<string, Promise<TIssueSubIssues>>();

  filters: IWorkItemSubIssueFiltersStore;
  // root store
  rootIssueDetailStore: IIssueDetail;
  // services
  serviceType;
  issueService;

  constructor(rootStore: IIssueDetail, serviceType: TIssueServiceType) {
    makeObservable(this, {
      // observables
      subIssuesStateDistribution: observable,
      subIssues: observable,
      filteredSubIssues: observable,
      subIssueHelpers: observable,
      loader: observable.ref,
      // actions
      setSubIssueHelpers: action,
      fetchSubIssues: action,
      createSubIssues: action,
      updateSubIssue: action,
      removeSubIssue: action,
      deleteSubIssue: action,
      fetchOtherProjectProperties: action,
    });
    this.filters = new WorkItemSubIssueFiltersStore(this);
    // root store
    this.rootIssueDetailStore = rootStore;
    // services
    this.serviceType = serviceType;
    this.issueService = new IssueService(serviceType);
  }

  // helper methods
  stateDistributionByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.subIssuesStateDistribution[issueId] ?? undefined;
  };

  subIssuesByIssueId = (issueId: string, queries?: TSubIssueQuery) => {
    const queryKey = getSubIssueQueryKey(queries);
    if (!queryKey) return this.subIssues[issueId];

    return this.filteredSubIssues[issueId]?.[queryKey];
  };

  subIssueHelpersByIssueId = (issueId: string) => ({
    preview_loader: this.subIssueHelpers?.[issueId]?.preview_loader || [],
    issue_visibility: this.subIssueHelpers?.[issueId]?.issue_visibility || [],
    issue_loader: this.subIssueHelpers?.[issueId]?.issue_loader || [],
  });

  // actions
  setSubIssueHelpers = (parentIssueId: string, key: TSubIssueHelpersKeys, value: string) => {
    if (!parentIssueId || !key || !value) return;

    update(this.subIssueHelpers, [parentIssueId, key], (_subIssueHelpers: string[] = []) => {
      if (_subIssueHelpers.includes(value)) return pull(_subIssueHelpers, value);
      return concat(_subIssueHelpers, value);
    });
  };
  subscribeToSubIssues = (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    queries?: TSubIssueQuery
  ) => {
    const key = JSON.stringify([workspaceSlug, projectId, parentIssueId, getSubIssueQueryKey(queries)]);
    const existing = this.subscriptions.get(key);
    if (existing) existing.subscribers += 1;
    else {
      this.subscriptions.set(key, {
        workspaceSlug,
        projectId,
        parentIssueId,
        queries: queries ? { ...queries } : undefined,
        subscribers: 1,
      });
    }
    if (this.subscriptions.size === 1 && !existing && typeof window !== "undefined") {
      window.addEventListener("focus", this.refreshOnFocus);
      document.addEventListener("visibilitychange", this.refreshOnFocus);
    }
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const subscription = this.subscriptions.get(key);
      if (subscription && --subscription.subscribers === 0) this.subscriptions.delete(key);
      if (this.subscriptions.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("focus", this.refreshOnFocus);
        document.removeEventListener("visibilitychange", this.refreshOnFocus);
      }
    };
  };

  private refreshOnFocus = () => {
    if (document.visibilityState === "hidden") return;
    const workspaces = new Set(Array.from(this.subscriptions.values(), ({ workspaceSlug }) => workspaceSlug));
    for (const workspaceSlug of workspaces) {
      void this.refreshSubscribedSubIssues(workspaceSlug).catch((error) => {
        console.error("Error refreshing expanded sub-work items:", error);
      });
    }
  };

  refreshSubscribedSubIssues = async (workspaceSlug: string, projectId?: string) => {
    const requests: Promise<TIssueSubIssues>[] = [];
    for (const subscription of this.subscriptions.values()) {
      if (subscription.workspaceSlug !== workspaceSlug || (projectId && subscription.projectId !== projectId)) continue;
      requests.push(
        this.fetchSubIssues(
          subscription.workspaceSlug,
          subscription.projectId,
          subscription.parentIssueId,
          subscription.queries
        )
      );
    }
    await Promise.all(requests);
  };

  fetchSubIssues = (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    queries?: Partial<Record<TIssueParams, string | boolean>>
  ) => {
    const key = JSON.stringify([workspaceSlug, projectId, parentIssueId, getSubIssueQueryKey(queries)]);
    const pending = this.pendingRequests.get(key);
    if (pending) return pending;
    const request = this.loadSubIssues(workspaceSlug, projectId, parentIssueId, queries).finally(() => {
      this.pendingRequests.delete(key);
      runInAction(() => {
        if (this.pendingRequests.size === 0) this.loader = undefined;
      });
    });
    this.pendingRequests.set(key, request);
    return request;
  };

  private loadSubIssues = async (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    queries?: TSubIssueQuery
  ) => {
    this.loader = "init-loader";
    const response = await this.issueService.subIssues(workspaceSlug, projectId, parentIssueId, queries);
    const queryKey = getSubIssueQueryKey(queries);

    const subIssuesStateDistribution = response?.state_distribution ?? {};

    const issueList = (response.sub_issues ?? []) as TIssue[];

    this.rootIssueDetailStore.rootIssueStore.issues.addIssue(issueList);

    // fetch other issues states and members when sub-issues are from different project
    if (issueList && issueList.length > 0) {
      const otherProjectIds = uniq(
        issueList.map((issue) => issue.project_id).filter((id) => !!id && id !== projectId)
      ) as string[];
      this.fetchOtherProjectProperties(workspaceSlug, otherProjectIds);
    }
    if (!queryKey) {
      this.rootIssueDetailStore.rootIssueStore.issues.updateIssue(parentIssueId, {
        sub_issues_count: issueList.length,
      });
    }

    runInAction(() => {
      if (queryKey) {
        set(
          this.filteredSubIssues,
          [parentIssueId, queryKey],
          issueList.map((issue) => issue.id)
        );
        return;
      }

      set(this.subIssuesStateDistribution, parentIssueId, subIssuesStateDistribution);
      set(
        this.subIssues,
        parentIssueId,
        issueList.map((issue) => issue.id)
      );
    });

    return response;
  };

  createSubIssues = async (workspaceSlug: string, projectId: string, parentIssueId: string, issueIds: string[]) => {
    const response = await this.issueService.addSubIssues(workspaceSlug, projectId, parentIssueId, {
      sub_issue_ids: issueIds,
    });

    const subIssuesStateDistribution = response?.state_distribution ?? {};
    const subIssues = Array.isArray(response?.sub_issues) ? response.sub_issues : [];

    // fetch other issues states and members when sub-issues are from different project
    if (subIssues && subIssues.length > 0) {
      const otherProjectIds = uniq(
        subIssues.map((issue) => issue.project_id).filter((id) => !!id && id !== projectId)
      ) as string[];
      this.fetchOtherProjectProperties(workspaceSlug, otherProjectIds);
    }

    runInAction(() => {
      Object.keys(subIssuesStateDistribution).forEach((key) => {
        const stateGroup = key as keyof TSubIssuesStateDistribution;
        update(this.subIssuesStateDistribution, [parentIssueId, stateGroup], (stateDistribution) => {
          if (!stateDistribution) return subIssuesStateDistribution[stateGroup];
          return concat(stateDistribution, subIssuesStateDistribution[stateGroup]);
        });
      });

      const createdIssueIds = subIssues.map((issue) => issue.id);
      update(this.subIssues, [parentIssueId], (issues) => {
        if (!issues) return createdIssueIds;
        return concat(issues, createdIssueIds);
      });
      delete this.filteredSubIssues[parentIssueId];
    });

    this.rootIssueDetailStore.rootIssueStore.issues.addIssue(subIssues);

    // update sub-issues_count of the parent issue
    set(
      this.rootIssueDetailStore.rootIssueStore.issues.issuesMap,
      [parentIssueId, "sub_issues_count"],
      this.subIssues[parentIssueId].length
    );

    return;
  };

  updateSubIssue = async (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    issueId: string,
    issueData: Partial<TIssue>,
    oldIssue: Partial<TIssue> = {},
    fromModal: boolean = false
  ) => {
    if (!fromModal)
      await this.rootIssueDetailStore.rootIssueStore.projectIssues.updateIssue(
        workspaceSlug,
        projectId,
        issueId,
        issueData
      );

    // parent update
    if (issueData.hasOwnProperty("parent_id") && issueData.parent_id !== oldIssue.parent_id) {
      runInAction(() => {
        if (oldIssue.parent_id) pull(this.subIssues[oldIssue.parent_id], issueId);
        if (issueData.parent_id)
          set(this.subIssues, [issueData.parent_id], concat(this.subIssues[issueData.parent_id], issueId));
      });
    }

    // state update
    if (issueData.hasOwnProperty("state_id") && issueData.state_id !== oldIssue.state_id) {
      let oldIssueStateGroup: string | undefined = undefined;
      let issueStateGroup: string | undefined = undefined;

      if (oldIssue.state_id) {
        const state = this.rootIssueDetailStore.rootIssueStore.rootStore.state.getStateById(oldIssue.state_id);
        if (state?.group) oldIssueStateGroup = state.group;
      }

      if (issueData.state_id) {
        const state = this.rootIssueDetailStore.rootIssueStore.rootStore.state.getStateById(issueData.state_id);
        if (state?.group) issueStateGroup = state.group;
      }

      if (oldIssueStateGroup && issueStateGroup && issueStateGroup !== oldIssueStateGroup) {
        runInAction(() => {
          if (oldIssueStateGroup)
            update(this.subIssuesStateDistribution, [parentIssueId, oldIssueStateGroup], (stateDistribution) => {
              if (!stateDistribution) return;
              return pull(stateDistribution, issueId);
            });

          if (issueStateGroup)
            update(this.subIssuesStateDistribution, [parentIssueId, issueStateGroup], (stateDistribution) => {
              if (!stateDistribution) return [issueId];
              return concat(stateDistribution, issueId);
            });
        });
      }
    }
    runInAction(() => {
      delete this.filteredSubIssues[parentIssueId];
      if (oldIssue.parent_id) delete this.filteredSubIssues[oldIssue.parent_id];
      if (issueData.parent_id) delete this.filteredSubIssues[issueData.parent_id];
    });

    return;
  };

  removeSubIssue = async (workspaceSlug: string, projectId: string, parentIssueId: string, issueId: string) => {
    await this.rootIssueDetailStore.rootIssueStore.projectIssues.updateIssue(workspaceSlug, projectId, issueId, {
      parent_id: null,
    });

    const issue = this.rootIssueDetailStore.issue.getIssueById(issueId);
    if (issue && issue.state_id) {
      let issueStateGroup: string | undefined = undefined;
      const state = this.rootIssueDetailStore.rootIssueStore.rootStore.state.getStateById(issue.state_id);
      if (state?.group) issueStateGroup = state.group;

      if (issueStateGroup) {
        runInAction(() => {
          if (issueStateGroup)
            update(this.subIssuesStateDistribution, [parentIssueId, issueStateGroup], (stateDistribution) => {
              if (!stateDistribution) return;
              return pull(stateDistribution, issueId);
            });
        });
      }
    }

    runInAction(() => {
      pull(this.subIssues[parentIssueId], issueId);
      // update sub-issues_count of the parent issue
      set(
        this.rootIssueDetailStore.rootIssueStore.issues.issuesMap,
        [parentIssueId, "sub_issues_count"],
        this.subIssues[parentIssueId]?.length
      );
      delete this.filteredSubIssues[parentIssueId];
    });

    return;
  };

  deleteSubIssue = async (workspaceSlug: string, projectId: string, parentIssueId: string, issueId: string) => {
    await this.rootIssueDetailStore.rootIssueStore.projectIssues.removeIssue(workspaceSlug, projectId, issueId);

    const issue = this.rootIssueDetailStore.issue.getIssueById(issueId);
    if (issue && issue.state_id) {
      let issueStateGroup: string | undefined = undefined;
      const state = this.rootIssueDetailStore.rootIssueStore.rootStore.state.getStateById(issue.state_id);
      if (state?.group) issueStateGroup = state.group;

      if (issueStateGroup) {
        runInAction(() => {
          if (issueStateGroup)
            update(this.subIssuesStateDistribution, [parentIssueId, issueStateGroup], (stateDistribution) => {
              if (!stateDistribution) return;
              return pull(stateDistribution, issueId);
            });
        });
      }
    }

    runInAction(() => {
      pull(this.subIssues[parentIssueId], issueId);
      // update sub-issues_count of the parent issue
      set(
        this.rootIssueDetailStore.rootIssueStore.issues.issuesMap,
        [parentIssueId, "sub_issues_count"],
        this.subIssues[parentIssueId]?.length
      );
      delete this.filteredSubIssues[parentIssueId];
    });

    return;
  };

  fetchOtherProjectProperties = async (workspaceSlug: string, projectIds: string[]) => {
    if (projectIds.length > 0) {
      for (const projectId of projectIds) {
        // fetching other project states
        this.rootIssueDetailStore.rootIssueStore.rootStore.state.fetchProjectStates(workspaceSlug, projectId);
        // fetching other project members
        this.rootIssueDetailStore.rootIssueStore.rootStore.memberRoot.project.fetchProjectMembers(
          workspaceSlug,
          projectId
        );
        // fetching other project labels
        this.rootIssueDetailStore.rootIssueStore.rootStore.label.fetchProjectLabels(workspaceSlug, projectId);
        // fetching other project cycles
        this.rootIssueDetailStore.rootIssueStore.rootStore.cycle.fetchAllCycles(workspaceSlug, projectId);
        // fetching other project modules
        this.rootIssueDetailStore.rootIssueStore.rootStore.module.fetchModules(workspaceSlug, projectId);
        // fetching other project estimates
        this.rootIssueDetailStore.rootIssueStore.rootStore.projectEstimate.getProjectEstimates(
          workspaceSlug,
          projectId
        );
      }
    }
  };
}
