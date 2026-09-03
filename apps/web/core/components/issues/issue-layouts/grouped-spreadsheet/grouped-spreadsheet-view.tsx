/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
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
import { useProject } from "@/hooks/store/use-project";
import { useBulkOperationStatus } from "@/hooks/use-bulk-operation-status";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { useTableKeyboardNavigation } from "@/hooks/use-table-keyboard-navigation";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TRenderQuickActions } from "../list/list-view-types";
import { getDisplayPropertiesCount, getGroupByColumns } from "../utils";
import { SpreadsheetIssueRow } from "../spreadsheet/issue-row";
import { SpreadsheetHeader } from "../spreadsheet/spreadsheet-header";
import {
  buildGroupedTableVirtualRows,
  formatEstimateTotal,
  groupedTableGroupTitle,
  sumNumericEstimateValues,
  shouldShowGroupedTableGroup,
} from "./utils";

const GROUPED_TABLE_ROW_HEIGHT = 44;
const GROUPED_TABLE_OVERSCAN = 4;
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
  const isBulkOperationsEnabled = useBulkOperationStatus();
  const handleKeyboardNavigation = useTableKeyboardNavigation();
  const { currentProjectDetails } = useProject();
  const { getCycleById } = useCycle();
  const estimate = useEstimate(currentProjectDetails?.estimate ?? undefined);
  const { issues } = useIssuesStore();
  const { getGroupIssueCount, getIssueLoader } = issues;
  const getGroupIssueMatchCount = "getGroupIssueMatchCount" in issues ? issues.getGroupIssueMatchCount : undefined;
  const { isMobile } = usePlatformOS();
  const [mobileExpansionOverrides, setMobileExpansionOverrides] = useState<Record<string, boolean>>({});

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
  const virtualRows = buildGroupedTableVirtualRows(virtualGroups);
  const loadedIssueIds = virtualGroups.flatMap((group) => group.issueIds);
  const entities = Object.fromEntries(virtualGroups.map((group) => [group.id, group.issueIds]));
  entities[SPREADSHEET_SELECT_GROUP] = loadedIssueIds;

  const handleGroupToggle = (groupId: string, isExpanded: boolean) => {
    if (!isMobile) {
      handleCollapsedGroups(groupId);
      return;
    }
    setMobileExpansionOverrides((current) => ({ ...current, [groupId]: !isExpanded }));
  };

  const isEstimateEnabled = currentProjectDetails?.estimate != null;
  const spreadsheetColumnsList = SPREADSHEET_PROPERTY_LIST.filter((property) => {
    if (property === "cycle" && !currentProjectDetails?.cycle_view) return false;
    if (property === "modules" && !currentProjectDetails?.module_view) return false;
    return true;
  });

  const ignoreFieldsForCounting: (keyof IIssueDisplayProperties)[] = ["key"];
  if (!isEstimateEnabled) ignoreFieldsForCounting.push("estimate");
  const columnCount = getDisplayPropertiesCount(displayProperties, ignoreFieldsForCounting) + 1;

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => GROUPED_TABLE_ROW_HEIGHT,
    overscan: GROUPED_TABLE_OVERSCAN,
    getItemKey: (index) => virtualRows[index]?.key ?? index,
  });
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
      requestMoreIssues(row.groupId, row.key, row.isLoading);
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
            >
              <table className="w-full min-w-max bg-surface-1" onKeyDown={handleKeyboardNavigation}>
                <SpreadsheetHeader
                  displayProperties={displayProperties}
                  displayFilters={displayFilters}
                  handleDisplayFilterUpdate={handleDisplayFilterUpdate}
                  canEditProperties={canEditProperties}
                  isEstimateEnabled={isEstimateEnabled}
                  spreadsheetColumnsList={spreadsheetColumnsList}
                  selectionHelpers={selectionHelpers}
                />
                <tbody>
                  {paddingTop > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={columnCount} style={{ height: `${paddingTop}px` }} />
                    </tr>
                  )}
                  {virtualItems.map((virtualItem) => {
                    const row = virtualRows[virtualItem.index];
                    if (!row) return null;

                    if (row.type === "issue") {
                      return (
                        <SpreadsheetIssueRow
                          key={row.key}
                          issueId={row.issueId}
                          displayProperties={displayProperties}
                          quickActions={quickActions}
                          canEditProperties={canEditProperties}
                          nestingLevel={0}
                          isEstimateEnabled={isEstimateEnabled}
                          updateIssue={updateIssue}
                          portalElement={portalRef}
                          containerRef={containerRef}
                          isScrolled={isScrolled}
                          spreadsheetColumnsList={spreadsheetColumnsList}
                          selectionHelpers={selectionHelpers}
                          forceRender
                        />
                      );
                    }

                    if (row.type === "load-more") {
                      return (
                        <tr key={row.key} aria-live="polite">
                          <td
                            colSpan={columnCount}
                            className="h-11 border-b border-subtle px-page-x text-12 text-tertiary"
                          >
                            {row.isLoading ? (
                              "Loading more work items…"
                            ) : (
                              <button
                                type="button"
                                className="font-medium text-accent-primary hover:text-accent-secondary hover:underline"
                                onClick={() => {
                                  requestedPageKeys.current.delete(row.key);
                                  requestMoreIssues(row.groupId, row.key, false);
                                }}
                              >
                                Load more work items
                              </button>
                            )}
                          </td>
                        </tr>
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
                    const startDate = cycle?.start_date
                      ? GROUP_DATE_FORMATTER.format(new Date(cycle.start_date))
                      : null;
                    const endDate = cycle?.end_date ? GROUP_DATE_FORMATTER.format(new Date(cycle.end_date)) : null;
                    const cycleStatus = cycle?.status?.toLowerCase();
                    const canLoadMoreIssues = virtualGroup.issueIds.length < virtualGroup.totalCount;

                    return (
                      <tr key={row.key} className="border-b-[0.5px] border-subtle bg-layer-2">
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
                    );
                  })}
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
