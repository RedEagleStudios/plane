/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ALL_ISSUES, SPREADSHEET_PROPERTY_LIST, SPREADSHEET_SELECT_GROUP } from "@plane/constants";
import type {
  GroupByColumnTypes,
  IGroupByColumn,
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  TGroupedIssues,
  TIssue,
  TIssueGroupByOptions,
  TIssueKanbanFilters,
  TIssueMap,
} from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { MultipleSelectGroup } from "@/components/core/multiple-select";
import { IssueBulkOperationsRoot } from "@/components/issues/bulk-operations";
import { QuickAddIssueRoot, SpreadsheetAddIssueButton } from "@/components/issues/issue-layouts/quick-add";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useBulkOperationStatus } from "@/hooks/use-bulk-operation-status";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { useTableKeyboardNavigation } from "@/hooks/use-table-keyboard-navigation";
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { getIssueHierarchyFilterQuery, shouldAutoExpandIssueHierarchy } from "../hierarchy-filter";
import type { TRenderQuickActions } from "../list/list-view-types";
import { getGroupByColumns } from "../utils";
import { ColumnResizeHandle } from "../spreadsheet/column-resize-handle";
import { SpreadsheetIssueRow } from "../spreadsheet/issue-row";
import { SpreadsheetHeader } from "../spreadsheet/spreadsheet-header";
import {
  buildGroupedTableVirtualRows,
  getGroupedTableVirtualRowHeight,
  formatEstimateTotal,
  groupedTableGroupTitle,
  sumNumericEstimateValues,
  shouldShowGroupedTableGroup,
  updateExpandedIssueRowKeys,
} from "./utils";

const GROUPED_TABLE_ROW_HEIGHT = 44;
const GROUPED_TABLE_OVERSCAN = 20;
const EMPTY_EXPANDED_KEYS: ReadonlySet<string> = new Set();
const GROUP_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

interface Props {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  groupedIssueIds: TGroupedIssues;
  issueMap: TIssueMap;
  groupBy: TIssueGroupByOptions | null;
  quickActions: TRenderQuickActions;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  canEditProperties: (projectId: string | undefined) => boolean;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  enableQuickCreateIssue?: boolean;
  disableIssueCreation?: boolean;
  showEmptyGroups?: boolean;
  collapsedGroups: TIssueKanbanFilters;
  handleCollapsedGroups: (groupId: string) => void;
  loadMoreIssues: (groupId?: string) => void | Promise<unknown>;
}

export const GroupedSpreadsheetView = observer(function GroupedSpreadsheetView(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    groupedIssueIds,
    issueMap,
    groupBy,
    quickActions,
    updateIssue,
    canEditProperties,
    quickAddCallback,
    enableQuickCreateIssue,
    disableIssueCreation,
    showEmptyGroups = false,
    collapsedGroups,
    handleCollapsedGroups,
    loadMoreIssues,
  } = props;

  const containerRef = useRef<HTMLTableElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const isScrolled = useRef(false);
  const requestedPageKeys = useRef(new Set<string>());
  const requestedHierarchyParents = useRef<Map<string, boolean> | undefined>(undefined);
  const { workspaceSlug } = useParams();
  const isBulkOperationsEnabled = useBulkOperationStatus();
  const handleKeyboardNavigation = useTableKeyboardNavigation();
  const { currentProjectDetails } = useProject();
  const { getCycleById } = useCycle();
  const estimate = useEstimate(currentProjectDetails?.estimate ?? undefined);
  const { issues, issuesFilter } = useIssuesStore();
  const { subIssues: subIssuesStore } = useIssueDetail();
  const { getGroupIssueCount, getIssueLoader } = issues;
  const getGroupIssueMatchCount = "getGroupIssueMatchCount" in issues ? issues.getGroupIssueMatchCount : undefined;
  const { isMobile } = usePlatformOS();
  const [mobileExpansionOverrides, setMobileExpansionOverrides] = useState<Record<string, boolean>>({});
  const hierarchyFilterQuery = getIssueHierarchyFilterQuery(
    issuesFilter.issueFilters?.richFilters,
    displayFilters.layout
  );
  const hierarchyFilters = hierarchyFilterQuery?.filters;
  const hierarchyLayout = hierarchyFilterQuery?.layout;
  const expansionContextKey = JSON.stringify([
    workspaceSlug,
    currentProjectDetails?.id,
    groupBy,
    hierarchyLayout,
    hierarchyFilters,
  ]);
  const [expansionState, setExpansionState] = useState({
    contextKey: expansionContextKey,
    expandedKeys: EMPTY_EXPANDED_KEYS,
    collapsedKeys: EMPTY_EXPANDED_KEYS,
  });
  const expandedKeys =
    expansionState.contextKey === expansionContextKey ? expansionState.expandedKeys : EMPTY_EXPANDED_KEYS;
  const collapsedKeys =
    expansionState.contextKey === expansionContextKey ? expansionState.collapsedKeys : EMPTY_EXPANDED_KEYS;
  const [columnWidths, setColumnWidths] = useState<Partial<Record<"title" | keyof IIssueDisplayProperties, number>>>(
    {}
  );
  const wrapTitle = displayFilters.wrap_titles ?? false;

  useEffect(() => {
    setExpansionState((current) =>
      current.contextKey === expansionContextKey
        ? current
        : { contextKey: expansionContextKey, expandedKeys: EMPTY_EXPANDED_KEYS, collapsedKeys: EMPTY_EXPANDED_KEYS }
    );
  }, [expansionContextKey]);

  const groups = useMemo(
    () =>
      getGroupByColumns({
        groupBy: groupBy as GroupByColumnTypes | null,
        includeNone: true,
        isWorkspaceLevel: false,
        projectId: currentProjectDetails?.id,
      }) ?? [],
    [currentProjectDetails?.id, groupBy]
  );

  const visibleGroups = groups.filter((group) => {
    const groupId = groupBy ? group.id : undefined;
    const cycleStatus =
      groupBy === "cycle" && group.id !== "None" ? getCycleById(group.id)?.status?.toLowerCase() : undefined;
    return shouldShowGroupedTableGroup({
      cycleStatus,
      groupBy,
      groupId: group.id,
      issueCount: getGroupIssueCount(groupId, undefined, false) ?? 0,
      showEmptyGroups,
    });
  });

  const virtualGroups = visibleGroups.map((group, groupIndex) => {
    const groupId = groupBy ? group.id : undefined;
    const rawIssueIds = groupBy ? groupedIssueIds[group.id] : groupedIssueIds[ALL_ISSUES];
    const issueIds = Array.isArray(rawIssueIds) ? rawIssueIds : [];
    const cycle = groupBy === "cycle" && group.id !== "None" ? getCycleById(group.id) : null;
    const isPersistedExpanded = !collapsedGroups.group_by.includes(group.id);
    const isMobileDefaultExpanded =
      group.id === "None" || cycle?.status?.toLowerCase() === "current" || groupIndex === 0;
    return {
      id: group.id,
      issueIds,
      totalCount: getGroupIssueCount(groupId, undefined, false) ?? issueIds.length,
      matchCount: getGroupIssueMatchCount?.(groupId, undefined, false) ?? issueIds.length,
      isLoadingMore: getIssueLoader(groupId, undefined) === "pagination",
      isExpanded: isMobile
        ? (mobileExpansionOverrides[group.id] ?? (isPersistedExpanded && isMobileDefaultExpanded))
        : isPersistedExpanded,
    };
  });

  const groupById = new Map<string, IGroupByColumn>(visibleGroups.map((group) => [group.id, group]));
  const virtualGroupById = new Map(virtualGroups.map((group) => [group.id, group]));
  const virtualRows = buildGroupedTableVirtualRows(virtualGroups, {
    getSubIssueIds: (issueId) => {
      const childIds = subIssuesStore.subIssuesByIssueId(issueId, hierarchyFilterQuery);
      return childIds && childIds.length > 1 && "issuesSortWithOrderBy" in issues
        ? issues.issuesSortWithOrderBy(childIds, displayFilters.order_by ?? "-created_at")
        : childIds;
    },
    isExpanded: (issueId, expansionKey, nestingLevel) =>
      expandedKeys.has(expansionKey) ||
      (!collapsedKeys.has(expansionKey) &&
        shouldAutoExpandIssueHierarchy(
          hierarchyFilterQuery,
          issueMap[issueId]?.sub_issues_count ?? 0,
          nestingLevel,
          false
        )),
  });
  const expandedIssueRowKeys = new Set<string>();
  const hierarchyParents = new Map<string, [projectId: string, issueId: string]>();
  const missingHierarchyParents: string[] = [];
  const entities = Object.fromEntries(virtualGroups.map((group) => [group.id, [...group.issueIds]]));
  for (const row of virtualRows) {
    if (row.type !== "issue") continue;
    if (row.nestingLevel > 0) entities[row.groupId].push(row.issueId);
    if (!row.isExpanded) continue;
    expandedIssueRowKeys.add(row.key);
    const projectId = issueMap[row.issueId]?.project_id;
    if (projectId && !hierarchyParents.has(row.issueId)) {
      hierarchyParents.set(row.issueId, [projectId, row.issueId]);
      if (subIssuesStore.subIssuesByIssueId(row.issueId, hierarchyFilterQuery) === undefined) {
        missingHierarchyParents.push(row.issueId);
      }
    }
  }
  entities[SPREADSHEET_SELECT_GROUP] = [...new Set(Object.values(entities).flat())];

  // Parent subscriptions belong to the hierarchy model, not its mounted viewport rows.
  const hierarchyParentKey = JSON.stringify(
    [...hierarchyParents.values()].toSorted(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d))
  );
  const missingHierarchyParentKey = JSON.stringify(missingHierarchyParents.toSorted());
  useEffect(() => {
    if (!workspaceSlug) return;
    const parents = JSON.parse(hierarchyParentKey) as [string, string][];
    const query =
      hierarchyFilters && hierarchyLayout
        ? { filters: hierarchyFilters, layout: hierarchyLayout, sub_issue: false as const }
        : undefined;
    const unsubscribe = parents.map(([projectId, issueId]) =>
      subIssuesStore.subscribeToSubIssues(workspaceSlug.toString(), projectId, issueId, query)
    );
    return () => unsubscribe.forEach((dispose) => dispose());
  }, [hierarchyParentKey, hierarchyFilters, hierarchyLayout, subIssuesStore, workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug) return;
    const parents = JSON.parse(hierarchyParentKey) as [string, string][];
    const missingParents = new Set<string>(JSON.parse(missingHierarchyParentKey) as string[]);
    const query =
      hierarchyFilters && hierarchyLayout
        ? { filters: hierarchyFilters, layout: hierarchyLayout, sub_issue: false as const }
        : undefined;
    const activeRequests = new Map<string, boolean>();
    for (const [projectId, issueId] of parents) {
      const requestKey = JSON.stringify([workspaceSlug, projectId, issueId, hierarchyLayout, hierarchyFilters]);
      const isCacheLoaded = !missingParents.has(issueId);
      const wasCacheLoaded = requestedHierarchyParents.current?.get(requestKey);
      activeRequests.set(requestKey, isCacheLoaded);
      // Fetch on expansion/remount and on loaded-to-missing cache invalidation.
      // An initially failed request remains missing, so it cannot trigger a retry loop.
      if (wasCacheLoaded !== undefined && !(wasCacheLoaded && !isCacheLoaded)) continue;
      void subIssuesStore.fetchSubIssues(workspaceSlug.toString(), projectId, issueId, query).catch((error) => {
        console.error("Error fetching sub-work items:", error);
      });
    }
    requestedHierarchyParents.current = activeRequests;
  }, [hierarchyParentKey, missingHierarchyParentKey, hierarchyFilters, hierarchyLayout, subIssuesStore, workspaceSlug]);

  const handleGroupToggle = (groupId: string, isExpanded: boolean) => {
    if (!isMobile) {
      handleCollapsedGroups(groupId);
      return;
    }
    setMobileExpansionOverrides((current) => ({ ...current, [groupId]: !isExpanded }));
  };

  const handleIssueExpansionChange = useCallback(
    (expansionKey: string, isExpanded: boolean) => {
      setExpansionState((current) => {
        const isCurrentContext = current.contextKey === expansionContextKey;
        const currentExpandedKeys = isCurrentContext ? current.expandedKeys : EMPTY_EXPANDED_KEYS;
        const currentCollapsedKeys = isCurrentContext ? current.collapsedKeys : EMPTY_EXPANDED_KEYS;
        return {
          contextKey: expansionContextKey,
          expandedKeys: updateExpandedIssueRowKeys(currentExpandedKeys, expansionKey, isExpanded),
          collapsedKeys: updateExpandedIssueRowKeys(
            updateExpandedIssueRowKeys(currentCollapsedKeys, expansionKey, false),
            expansionKey,
            !isExpanded
          ),
        };
      });
    },
    [expansionContextKey]
  );

  const isEstimateEnabled = currentProjectDetails?.estimate != null;
  const spreadsheetColumnsList = SPREADSHEET_PROPERTY_LIST.filter((property) => {
    if (property === "cycle" && !currentProjectDetails?.cycle_view) return false;
    if (property === "modules" && !currentProjectDetails?.module_view) return false;
    return true;
  });

  const visibleColumns = spreadsheetColumnsList.filter(
    (property) => displayProperties[property] && shouldRenderColumn(property)
  );
  const columnCount = visibleColumns.length + 1;
  const titleWidth = columnWidths.title ?? 480;
  const tableWidth =
    titleWidth + visibleColumns.reduce((total, property) => total + (columnWidths[property] ?? 180), 0);
  const visibleColumnKey = `${!!displayProperties.key}:${visibleColumns.join(",")}`;

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index];
      return row ? getGroupedTableVirtualRowHeight(row, GROUPED_TABLE_ROW_HEIGHT) : GROUPED_TABLE_ROW_HEIGHT;
    },
    overscan: GROUPED_TABLE_OVERSCAN,
    getItemKey: (index) => virtualRows[index]?.key ?? index,
  });
  // Every measured tbody contains a single row, including expanded descendants.
  // Invalidate offscreen heights as well when wrapping or column widths change.
  useEffect(() => {
    rowVirtualizer.measure();
    containerRef.current
      ?.querySelectorAll<HTMLTableSectionElement>("tbody[data-index]")
      .forEach(rowVirtualizer.measureElement);
  }, [rowVirtualizer, wrapTitle, columnWidths, visibleColumnKey]);
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  useEffect(() => {
    requestedPageKeys.current.clear();
  }, [groupBy, groupedIssueIds]);

  const requestMoreIssues = useCallback(
    (groupId: string, pageKey: string, isLoading: boolean) => {
      if (isLoading || requestedPageKeys.current.has(pageKey)) return;

      requestedPageKeys.current.add(pageKey);
      void Promise.resolve(loadMoreIssues(groupBy ? groupId : undefined)).catch(() => {
        requestedPageKeys.current.delete(pageKey);
      });
    },
    [groupBy, loadMoreIssues]
  );

  useEffect(() => {
    for (const virtualItem of virtualItems) {
      const row = virtualRows[virtualItem.index];
      if (row?.type !== "load-more") continue;
      requestMoreIssues(row.groupId, row.pageKey, row.isLoading);
    }
  }, [requestMoreIssues, virtualItems, virtualRows]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollLeft = containerRef.current.scrollLeft;
    if (scrollLeft > 0 === isScrolled.current) return;

    const firstColumns = containerRef.current.querySelectorAll("table tr td:first-child, th:first-child");
    for (let index = 0; index < firstColumns.length; index++) {
      const shadow = index === 0 ? "8px -22px 22px 10px rgba(0, 0, 0, 0.05)" : "8px 22px 22px 10px rgba(0, 0, 0, 0.05)";
      (firstColumns[index] as HTMLElement).style.boxShadow = scrollLeft > 0 ? shadow : "none";
    }
    isScrolled.current = scrollLeft > 0;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    container?.addEventListener("scroll", handleScroll, { passive: true });
    return () => container?.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  if (visibleGroups.length === 0) return null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-layer-1 whitespace-nowrap text-secondary">
      <div ref={portalRef} className="spreadsheet-menu-portal" />
      <MultipleSelectGroup containerRef={containerRef} entities={entities} disabled={!isBulkOperationsEnabled}>
        {(selectionHelpers: TSelectionHelper) => (
          <>
            <div
              ref={containerRef}
              className="vertical-scrollbar horizontal-scrollbar scrollbar-lg h-full w-full touch-pan-x touch-pan-y overflow-auto"
              style={{ overflowAnchor: "none" }}
            >
              <table
                className="table-fixed bg-surface-1 [&_td]:overflow-hidden"
                style={{ width: tableWidth }}
                onKeyDown={handleKeyboardNavigation}
              >
                <colgroup>
                  <col style={{ width: titleWidth }} />
                  {visibleColumns.map((property) => (
                    <col key={property} style={{ width: columnWidths[property] ?? 180 }} />
                  ))}
                </colgroup>
                <SpreadsheetHeader
                  displayProperties={displayProperties}
                  displayFilters={displayFilters}
                  handleDisplayFilterUpdate={handleDisplayFilterUpdate}
                  canEditProperties={canEditProperties}
                  isEstimateEnabled={isEstimateEnabled}
                  spreadsheetColumnsList={spreadsheetColumnsList}
                  selectionHelpers={selectionHelpers}
                  renderResizeHandle={(column) => (
                    <ColumnResizeHandle
                      label={column === "title" ? "Work items" : column.replaceAll("_", " ")}
                      width={columnWidths[column] ?? (column === "title" ? 480 : 180)}
                      minWidth={column === "title" ? 280 : 144}
                      onResize={(width) =>
                        setColumnWidths((current) =>
                          current[column] === width ? current : { ...current, [column]: width }
                        )
                      }
                    />
                  )}
                />
                <tbody>
                  {paddingTop > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={columnCount} style={{ height: `${paddingTop}px` }} />
                    </tr>
                  )}
                </tbody>
                {virtualItems.map((virtualItem) => {
                  const row = virtualRows[virtualItem.index];
                  if (!row) return null;

                  if (row.type === "issue") {
                    return (
                      <tbody key={row.key} data-index={virtualItem.index} ref={rowVirtualizer.measureElement}>
                        <SpreadsheetIssueRow
                          issueId={row.issueId}
                          displayProperties={displayProperties}
                          quickActions={quickActions}
                          canEditProperties={canEditProperties}
                          nestingLevel={row.nestingLevel}
                          spacingLeft={6 + row.nestingLevel * 12}
                          isEstimateEnabled={isEstimateEnabled}
                          updateIssue={updateIssue}
                          portalElement={portalRef}
                          containerRef={containerRef}
                          isScrolled={isScrolled}
                          spreadsheetColumnsList={spreadsheetColumnsList}
                          selectionHelpers={selectionHelpers}
                          forceRender
                          renderSubIssues={false}
                          wrapTitle={wrapTitle}
                          fixedColumns
                          expansionKey={row.key}
                          expandedIssueKeys={expandedIssueRowKeys}
                          onIssueExpansionChange={handleIssueExpansionChange}
                        />
                      </tbody>
                    );
                  }

                  if (row.type === "load-more") {
                    return (
                      <tbody key={row.key} data-index={virtualItem.index} ref={rowVirtualizer.measureElement}>
                        <tr aria-live="polite">
                          <td
                            colSpan={columnCount}
                            className="border-b border-subtle align-top text-12 text-tertiary"
                            style={{ height: `${getGroupedTableVirtualRowHeight(row, GROUPED_TABLE_ROW_HEIGHT)}px` }}
                          >
                            <div className="sticky top-11 flex h-11 items-center bg-surface-1 px-page-x">
                              {row.isLoading ? (
                                "Loading more work items…"
                              ) : (
                                <button
                                  type="button"
                                  className="font-medium text-accent-primary hover:text-accent-secondary hover:underline"
                                  onClick={() => {
                                    requestedPageKeys.current.delete(row.pageKey);
                                    requestMoreIssues(row.groupId, row.pageKey, false);
                                  }}
                                >
                                  Load more work items
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    );
                  }

                  const group = groupById.get(row.groupId);
                  const virtualGroup = virtualGroupById.get(row.groupId);
                  if (!group || !virtualGroup) return null;

                  const cycle = groupBy === "cycle" && group.id !== "None" ? getCycleById(group.id) : null;
                  const estimateTotal = sumNumericEstimateValues(
                    virtualGroup.issueIds.map((issueId) => {
                      const estimatePointId = issueMap[issueId]?.estimate_point;
                      return estimatePointId ? estimate.estimatePointById?.(estimatePointId)?.value : null;
                    })
                  );
                  const title = groupedTableGroupTitle(groupBy, group.id, group.name);
                  const startDate = cycle?.start_date ? GROUP_DATE_FORMATTER.format(new Date(cycle.start_date)) : null;
                  const endDate = cycle?.end_date ? GROUP_DATE_FORMATTER.format(new Date(cycle.end_date)) : null;
                  const cycleStatus = cycle?.status?.toLowerCase();
                  const canLoadMoreIssues = virtualGroup.issueIds.length < virtualGroup.totalCount;

                  return (
                    <tbody key={row.key} data-index={virtualItem.index} ref={rowVirtualizer.measureElement}>
                      <tr className="border-b-[0.5px] border-subtle bg-layer-2">
                        <td colSpan={columnCount} className="h-11 px-page-x">
                          <button
                            type="button"
                            className="flex h-full w-full items-center gap-2 text-left"
                            onClick={() => handleGroupToggle(group.id, virtualGroup.isExpanded)}
                          >
                            {virtualGroup.isExpanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                            {group.icon}
                            <span className="font-semibold text-primary">{title}</span>
                            <span className="rounded-full bg-layer-3 px-2 py-0.5 text-11 text-secondary">
                              {virtualGroup.matchCount}
                            </span>
                            {estimateTotal !== null && (
                              <span className="rounded-full bg-layer-3 px-2 py-0.5 text-11 text-secondary">
                                ETA: {formatEstimateTotal(estimateTotal)}h{canLoadMoreIssues ? "+" : ""}
                              </span>
                            )}
                            {startDate && endDate && (
                              <span className="text-11 text-tertiary">
                                {startDate}–{endDate}
                              </span>
                            )}
                            {cycleStatus && (
                              <span className="rounded-full border border-subtle px-2 py-0.5 text-11 text-tertiary capitalize">
                                {cycleStatus}
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
                <tbody>
                  {paddingBottom > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={columnCount} style={{ height: `${paddingBottom}px` }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!disableIssueCreation && enableQuickCreateIssue && (
              <div className="border-t border-subtle">
                <QuickAddIssueRoot
                  layout={EIssueLayoutTypes.GROUPED_SPREADSHEET}
                  QuickAddButton={SpreadsheetAddIssueButton}
                  quickAddCallback={quickAddCallback}
                  displayProperties={displayProperties}
                  spreadsheetColumnsList={spreadsheetColumnsList}
                />
              </div>
            )}
            <IssueBulkOperationsRoot selectionHelpers={selectionHelpers} />
          </>
        )}
      </MultipleSelectGroup>
    </div>
  );
});
