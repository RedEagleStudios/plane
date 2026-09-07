/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TIssue, TIssuesResponse } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { ProjectViewIssuesFilter } from "@/store/issue/project-views/filter.store";
import { ProjectViewIssues } from "@/store/issue/project-views/issue.store";
import type { IIssueRootStore } from "@/store/issue/root.store";
import { BaseGroupedSpreadsheetRoot } from "./base-grouped-spreadsheet-root";
import type { GroupedSpreadsheetView } from "./grouped-spreadsheet-view";

const { renderView } = vi.hoisted(() => ({
  renderView: vi.fn<(props: ComponentProps<typeof GroupedSpreadsheetView>) => null>(() => null),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: "workspace", projectId: "project", viewId: "saved-view" }),
}));
vi.mock("@/hooks/store/use-issues", () => ({ useIssues: vi.fn() }));
vi.mock("@/lib/store-context", () => ({ store: {} }));
vi.mock("@/hooks/store/user", () => ({
  useUserPermissions: () => ({ allowPermissions: () => true }),
}));
vi.mock("@/hooks/use-issue-layout-store", () => ({
  useIssueStoreType: () => EIssuesStoreType.PROJECT_VIEW,
}));
vi.mock("../issue-layout-HOC", () => ({
  IssueLayoutHOC: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./grouped-spreadsheet-view", () => ({ GroupedSpreadsheetView: renderView }));

function createViewStore() {
  const issueMap: Record<string, TIssue> = {};
  const root = {
    viewId: "saved-view",
    issues: {
      addIssue: (issues: TIssue[]) => {
        for (const issue of issues) issueMap[issue.id] = issue;
      },
      getIssuesByIds: (ids: string[]) => ids.map((id) => issueMap[id]),
    },
    issueDetail: { relation: { extractRelationsFromIssues: vi.fn() } },
    projectViewIssues: undefined as ProjectViewIssues | undefined,
  };
  const filters = new ProjectViewIssuesFilter(root as unknown as IIssueRootStore);
  const issues = new ProjectViewIssues(root as unknown as IIssueRootStore, filters);
  root.projectViewIssues = issues;
  runInAction(() => {
    filters.filters["saved-view"] = {
      richFilters: {},
      displayProperties: {},
      displayFilters: {
        layout: EIssueLayoutTypes.GROUPED_SPREADSHEET,
        group_by: "cycle",
        order_by: "-created_at",
      },
      kanbanFilters: { group_by: [], sub_group_by: [] },
    };
  });
  vi.mocked(useIssues).mockReturnValue({ issues, issuesFilter: filters, issueMap } as never);
  return { issues, filters };
}

const response: TIssuesResponse = {
  grouped_by: "cycle",
  next_cursor: "100:1:0",
  prev_cursor: "100:0:0",
  next_page_results: false,
  prev_page_results: false,
  total_count: 2,
  count: 2,
  total_results: 2,
  total_pages: 1,
  extra_stats: null,
  results: {
    cycle: {
      total_results: 2,
      results: [
        { id: "newer", created_at: "2026-02-01T00:00:00Z" },
        { id: "older", created_at: "2026-01-01T00:00:00Z" },
      ] as TIssue[],
    },
  },
};

describe("Grouped spreadsheet saved-view sorting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    renderView.mockClear();
  });

  it("reloads sorted rows from the owning project rather than treating the view as a project", async () => {
    const { issues, filters } = createViewStore();
    vi.spyOn(issues.issueService, "getIssues").mockImplementation(async (_workspace, projectId) => {
      if (projectId !== "project") throw new Error("Project not found");
      return response;
    });
    await issues.fetchIssues("workspace", "project", "saved-view", "init-loader", {
      canGroup: true,
      perPageCount: 100,
    });
    expect(issues.getIssueIds("cycle")).toEqual(["newer", "older"]);

    renderToString(<BaseGroupedSpreadsheetRoot QuickActions={() => null} viewId="saved-view" />);
    const props = renderView.mock.lastCall![0];
    props.handleDisplayFilterUpdate({ order_by: "created_at" });

    expect(filters.issueFilters?.displayFilters?.order_by).toBe("created_at");
    await vi.waitFor(() => {
      expect(issues.getIssueIds("cycle")).toEqual(["older", "newer"]);
      expect(issues.getIssueLoader()).toBeUndefined();
      // The layout remains a skeleton when the count is undefined, even with its loader cleared.
      expect(issues.getGroupIssueCount(undefined, undefined, false)).toBe(2);
    });
  });
});
