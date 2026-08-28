/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { Button } from "@plane/propel/button";
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
import type { TRenderQuickActions } from "../list/list-view-types";
import { getDisplayPropertiesCount, getGroupByColumns } from "../utils";
import { SpreadsheetIssueRow } from "../spreadsheet/issue-row";
import { SpreadsheetHeader } from "../spreadsheet/spreadsheet-header";
import { formatEstimateTotal, groupedTableGroupTitle, sumNumericEstimateValues } from "./utils";

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
  loadMoreIssues: (groupId?: string) => void;
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
  const isBulkOperationsEnabled = useBulkOperationStatus();
  const handleKeyboardNavigation = useTableKeyboardNavigation();
  const { currentProjectDetails } = useProject();
  const { getCycleById } = useCycle();
  const estimate = useEstimate(currentProjectDetails?.estimate ?? undefined);
  const {
    issues: { getGroupIssueCount, getIssueLoader },
  } = useIssuesStore();

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
    if (showEmptyGroups) return true;
    const groupIds = groupBy ? groupedIssueIds[group.id] : groupedIssueIds[ALL_ISSUES];
    return Array.isArray(groupIds) && groupIds.length > 0;
  });

  const loadedIssueIds = visibleGroups.flatMap((group) => {
    const groupIds = groupBy ? groupedIssueIds[group.id] : groupedIssueIds[ALL_ISSUES];
    return Array.isArray(groupIds) ? groupIds : [];
  });

  const entities = Object.fromEntries(
    visibleGroups.map((group) => {
      const groupIds = groupBy ? groupedIssueIds[group.id] : groupedIssueIds[ALL_ISSUES];
      return [group.id, Array.isArray(groupIds) ? groupIds : []];
    })
  );
  entities[SPREADSHEET_SELECT_GROUP] = loadedIssueIds;

  const isEstimateEnabled = currentProjectDetails?.estimate !== null;
  const spreadsheetColumnsList = SPREADSHEET_PROPERTY_LIST.filter((property) => {
    if (property === "cycle" && !currentProjectDetails?.cycle_view) return false;
    if (property === "modules" && !currentProjectDetails?.module_view) return false;
    return true;
  });

  const ignoreFieldsForCounting: (keyof IIssueDisplayProperties)[] = ["key"];
  if (!isEstimateEnabled) ignoreFieldsForCounting.push("estimate");
  const columnCount = getDisplayPropertiesCount(displayProperties, ignoreFieldsForCounting) + 1;

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
    container?.addEventListener("scroll", handleScroll);
    return () => container?.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  if (visibleGroups.length === 0) return null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-layer-1 whitespace-nowrap text-secondary">
      <div ref={portalRef} className="spreadsheet-menu-portal" />
      <MultipleSelectGroup containerRef={containerRef} entities={entities} disabled={!isBulkOperationsEnabled}>
        {(selectionHelpers: TSelectionHelper) => (
          <>
            <div ref={containerRef} className="vertical-scrollbar horizontal-scrollbar scrollbar-lg h-full w-full">
              <table className="w-full overflow-y-auto bg-surface-1" onKeyDown={handleKeyboardNavigation}>
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
                  {visibleGroups.map((group: IGroupByColumn) => {
                    const rawIssueIds = groupBy ? groupedIssueIds[group.id] : groupedIssueIds[ALL_ISSUES];
                    const issueIds = Array.isArray(rawIssueIds) ? rawIssueIds : [];
                    const groupId = groupBy ? group.id : undefined;
                    const totalIssueCount = getGroupIssueCount(groupId, undefined, false) ?? issueIds.length;
                    const canLoadMoreIssues = issueIds.length < totalIssueCount;
                    const isLoadingMoreIssues = !!getIssueLoader(groupId);
                    const isExpanded = !collapsedGroups.group_by.includes(group.id);
                    const cycle = groupBy === "cycle" && group.id !== "None" ? getCycleById(group.id) : null;
                    const estimateTotal = sumNumericEstimateValues(
                      issueIds.map((issueId) => {
                        const estimatePointId = issueMap[issueId]?.estimate_point;
                        return estimatePointId ? estimate.estimatePointById?.(estimatePointId)?.value : null;
                      })
                    );
                    const title = groupedTableGroupTitle(groupBy, group.id, group.name);
                    const startDate = cycle?.start_date
                      ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(
                          new Date(cycle.start_date)
                        )
                      : null;
                    const endDate = cycle?.end_date
                      ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(
                          new Date(cycle.end_date)
                        )
                      : null;
                    const cycleStatus = cycle?.status?.toLowerCase();

                    return (
                      <Fragment key={group.id}>
                        <tr className="border-b-[0.5px] border-subtle bg-layer-2">
                          <td colSpan={columnCount} className="h-11 px-page-x">
                            <button
                              type="button"
                              className="flex h-full w-full items-center gap-2 text-left"
                              onClick={() => handleCollapsedGroups(group.id)}
                            >
                              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              {group.icon}
                              <span className="font-semibold text-primary">{title}</span>
                              <span className="rounded-full bg-layer-3 px-2 py-0.5 text-11 text-secondary">
                                {totalIssueCount}
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
                        {isExpanded &&
                          issueIds.map((issueId, issueIndex) => (
                            <SpreadsheetIssueRow
                              key={issueId}
                              issueId={issueId}
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
                              shouldRenderByDefault={issueIndex < 10}
                            />
                          ))}
                        {isExpanded && canLoadMoreIssues && (
                          <tr>
                            <td colSpan={columnCount} className="border-b border-subtle p-2 pl-8">
                              <Button
                                variant="link"
                                disabled={isLoadingMoreIssues}
                                onClick={() => loadMoreIssues(groupId)}
                              >
                                {isLoadingMoreIssues ? "Loading..." : "Load more"}
                              </Button>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!disableIssueCreation && enableQuickCreateIssue && (
              <div className="border-t border-subtle">
                <QuickAddIssueRoot
                  layout={EIssueLayoutTypes.GROUPED_SPREADSHEET}
                  QuickAddButton={SpreadsheetAddIssueButton}
                  quickAddCallback={quickAddCallback}
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
