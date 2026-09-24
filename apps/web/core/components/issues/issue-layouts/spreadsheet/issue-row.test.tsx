/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { TIssue, TIssueOrderByOptions, TWorkItemFilterExpression } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { ProjectViewIssuesFilter } from "@/store/issue/project-views/filter.store";
import { ProjectViewIssues } from "@/store/issue/project-views/issue.store";
import type { IIssueRootStore } from "@/store/issue/root.store";
import { buildGroupedTableVirtualRows } from "../grouped-spreadsheet/utils";
import { SpreadsheetIssueRow } from "./issue-row";

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: "workspace", projectId: "project", viewId: "saved-view" }),
}));
vi.mock("@/lib/store-context", () => ({ store: {} }));
vi.mock("@/hooks/store/use-issues", () => ({ useIssues: vi.fn() }));
vi.mock("@/hooks/use-issue-layout-store", () => ({ useIssuesStore: vi.fn() }));
vi.mock("@/hooks/store/use-issue-detail", () => ({ useIssueDetail: vi.fn() }));
vi.mock("@/hooks/store/use-project", () => ({
  useProject: () => ({ getProjectIdentifierById: () => "PROJ" }),
}));
vi.mock("@/hooks/use-issue-peek-overview-redirection", () => ({
  default: () => ({ handleRedirection: vi.fn() }),
}));
vi.mock("@/hooks/use-platform-os", () => ({ usePlatformOS: () => ({ isMobile: false }) }));
vi.mock("@plane/hooks", () => ({ useOutsideClickDetector: vi.fn() }));
vi.mock("@plane/propel/tooltip", () => ({ Tooltip: ({ children }: { children: ReactNode }) => children }));
vi.mock("@plane/ui", () => ({
  ControlLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/core/multiple-select", () => ({ MultipleSelectEntityAction: () => null }));
vi.mock("@/components/core/render-if-visible-HOC", () => ({
  default: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));
vi.mock("@/components/issues/issue-detail/issue-identifier", () => ({ IssueIdentifier: () => null }));
vi.mock("../utils", () => ({ isIssueNew: () => false }));
vi.mock("./issue-column", () => ({ IssueColumn: () => null }));

function createHierarchy() {
  const issueMap = observable<Record<string, TIssue>>(
    Object.fromEntries(
      ["parent", "early", "late", "early-grandchild", "late-grandchild", "other-parent"].map((id, index) => {
        const isEarly = id.startsWith("early");
        return [
          id,
          {
            id,
            name: id,
            project_id: "project",
            sequence_id: index + 1,
            created_at: isEarly ? "2026-01-01T00:00:00Z" : "2026-02-01T00:00:00Z",
            target_date: isEarly ? "2026-03-01" : "2026-04-01",
            priority: isEarly ? "low" : "urgent",
            state_id: isEarly ? "alpha" : "zulu",
            sub_issues_count: id === "parent" || id === "early" ? 2 : 0,
          } as TIssue,
        ];
      })
    )
  );
  const children = observable<Record<string, string[] | undefined>>({
    parent: ["late", "early"],
    early: ["late-grandchild", "early-grandchild"],
  });
  const filteredChildren = observable.map<string, string[]>();
  const root = {
    viewId: "saved-view",
    issues: { getIssuesByIds: (ids: string[]) => ids.map((id) => issueMap[id]) },
    stateMap: { alpha: { name: "Alpha" }, zulu: { name: "Zulu" } },
  };
  const filters = new ProjectViewIssuesFilter(root as unknown as IIssueRootStore);
  const issues = new ProjectViewIssues(root as unknown as IIssueRootStore, filters);
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
  const store = { issues, issuesFilter: filters, issueMap };
  vi.mocked(useIssues).mockReturnValue(store as never);
  vi.mocked(useIssuesStore).mockReturnValue(store as never);
  vi.mocked(useIssueDetail).mockReturnValue({
    subIssues: {
      subIssuesByIssueId: (id: string, query?: unknown) => (query ? filteredChildren.get(id) : children[id]),
    },
    issue: { getIssueById: (id: string) => issueMap[id] },
    getIsIssuePeeked: () => false,
  } as never);

  const setOrder = (order: TIssueOrderByOptions) => {
    runInAction(() => {
      filters.filters["saved-view"].displayFilters!.order_by = order;
    });
  };
  const setRichFilters = (richFilters: TWorkItemFilterExpression) => {
    runInAction(() => {
      filters.filters["saved-view"].richFilters = richFilters;
    });
  };
  return { setOrder, setRichFilters, children, filteredChildren, issueMap };
}

const expandedKeys = new Set(["cycle:parent", "cycle:parent:early"]);
const rowProps: Omit<ComponentProps<typeof SpreadsheetIssueRow>, "issueId" | "expansionKey"> = {
  displayProperties: {},
  isEstimateEnabled: false,
  quickActions: () => <></>,
  canEditProperties: () => false,
  updateIssue: undefined,
  portalElement: { current: null },
  nestingLevel: 0,
  isScrolled: { current: false },
  containerRef: { current: null },
  spreadsheetColumnsList: [],
  selectionHelpers: {
    handleClearSelection: vi.fn(),
    handleEntityClick: vi.fn(),
    handleGroupClick: vi.fn(),
    isGroupSelected: () => "empty",
    getIsEntitySelected: () => false,
    getIsEntityActive: () => false,
    isSelectionDisabled: true,
  },
  expandedIssueKeys: expandedKeys,
};

function renderHierarchy(expandedIssueKeys: ReadonlySet<string> = expandedKeys) {
  const markup = renderToString(
    <table>
      <tbody>
        <SpreadsheetIssueRow
          {...rowProps}
          issueId="parent"
          expansionKey="cycle:parent"
          expandedIssueKeys={expandedIssueKeys}
        />
        <SpreadsheetIssueRow {...rowProps} issueId="other-parent" expansionKey="other-cycle:other-parent" />
      </tbody>
    </table>
  );
  return [...markup.matchAll(/id="issue-([^"]+)"/g)].map((match) => match[1]);
}

const ascendingRows = ["parent", "early", "early-grandchild", "late-grandchild", "late", "other-parent"];
const descendingRows = ["parent", "late", "early", "late-grandchild", "early-grandchild", "other-parent"];

describe("Spreadsheet child sorting", () => {
  it.each<[TIssueOrderByOptions, TIssueOrderByOptions]>([
    ["priority", "-priority"],
    ["created_at", "-created_at"],
    ["target_date", "-target_date"],
    ["state__name", "-state__name"],
  ])(
    "reorders nested siblings for %s and %s without moving descendants outside their parent",
    (ascending, descending) => {
      const { setOrder, children } = createHierarchy();
      setOrder(ascending);
      expect(renderHierarchy()).toEqual(ascendingRows);
      setOrder(descending);
      expect(renderHierarchy()).toEqual(descendingRows);
      setOrder(ascending);
      expect(renderHierarchy()).toEqual(ascendingRows);
      expect(children.parent).toEqual(["late", "early"]);
      expect(children.early).toEqual(["late-grandchild", "early-grandchild"]);
    }
  );

  it("uses the latest sort when descendants are loaded and expanded later", () => {
    const { setOrder, children } = createHierarchy();
    runInAction(() => {
      children.early = undefined;
    });
    setOrder("-priority");
    expect(renderHierarchy(new Set(["cycle:parent"]))).toEqual(["parent", "late", "early", "other-parent"]);
    setOrder("priority");
    runInAction(() => {
      children.early = ["late-grandchild", "early-grandchild"];
    });
    expect(renderHierarchy()).toEqual(ascendingRows);
  });

  it("does not render unfiltered detail siblings in a filtered hierarchy", () => {
    const { setRichFilters, filteredChildren } = createHierarchy();
    runInAction(() => {
      filteredChildren.set("parent", ["early"]);
    });
    setRichFilters({ label_id__in: "bug-label" });

    expect(renderHierarchy(new Set(["cycle:parent"]))).toEqual(["parent", "early", "other-parent"]);
  });

  it("keeps missing due dates last in both directions at each depth", () => {
    const { setOrder, issueMap } = createHierarchy();
    runInAction(() => {
      issueMap.early.target_date = null;
      issueMap["early-grandchild"].target_date = null;
    });
    setOrder("target_date");
    expect(renderHierarchy()).toEqual(descendingRows);
    setOrder("-target_date");
    expect(renderHierarchy()).toEqual(descendingRows);
  });

  it("renders a virtual child window without recursively mounting expanded siblings or descendants", () => {
    const { children, issueMap } = createHierarchy();
    const childIds = Array.from({ length: 115 }, (_, index) => `child-${index}`);
    runInAction(() => {
      children.parent = childIds;
      childIds.forEach((id, index) => {
        issueMap[id] = { ...issueMap.early, id, name: id, sequence_id: index + 10, sub_issues_count: 0 };
      });
      children["child-50"] = ["early-grandchild"];
      issueMap["child-50"].sub_issues_count = 1;
    });
    const expandedIssueKeys = new Set(["issue:cycle:parent", "issue:cycle:parent:child-50"]);
    const rows = buildGroupedTableVirtualRows(
      [{ id: "cycle", issueIds: ["parent"], totalCount: 1, isExpanded: true, isLoadingMore: false }],
      {
        getSubIssueIds: (id) => children[id],
        isExpanded: (_id, key) => expandedIssueKeys.has(key),
      }
    );
    const renderWindow = (start: number, end: number) => {
      const markup = renderToString(
        <table>
          <tbody>
            {rows
              .slice(start, end)
              .map((row) =>
                row.type === "issue" ? (
                  <SpreadsheetIssueRow
                    {...rowProps}
                    key={row.key}
                    issueId={row.issueId}
                    expansionKey={row.key}
                    nestingLevel={row.nestingLevel}
                    expandedIssueKeys={expandedIssueKeys}
                    renderSubIssues={false}
                    forceRender
                  />
                ) : null
              )}
          </tbody>
        </table>
      );
      return [...markup.matchAll(/id="issue-([^"]+)"/g)].map((match) => match[1]);
    };
    expect(renderWindow(1, 2)).toEqual(["parent"]);
    expect(renderWindow(52, 55)).toEqual(["child-50", "early-grandchild", "child-51"]);
    expect(renderWindow(53, 55)).toEqual(["early-grandchild", "child-51"]);
  });
});
