/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { ListFilter } from "lucide-react";
import { ALL_ISSUES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { GroupByColumnTypes, TIssue, TIssueServiceType, TSubIssueOperations } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
// hooks
import { SectionEmptyState } from "@/components/empty-state/section-empty-state-root";
import { getGroupByColumns, isWorkspaceLevel } from "@/components/issues/issue-layouts/utils";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

import { SubIssuesListGroup } from "./list-group";
import { SubIssuesListItem } from "./list-item";
import { useSubIssueVirtualizer } from "./use-virtualized-rows";
import { buildSubIssueVirtualRows } from "./virtual-rows";

type Props = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  rootIssueId: string;
  spacingLeft: number;
  canEdit: boolean;
  handleIssueCrudState: (
    key: "create" | "existing" | "update" | "delete",
    issueId: string,
    issue?: TIssue | null
  ) => void;
  subIssueOperations: TSubIssueOperations;
  issueServiceType?: TIssueServiceType;
  storeType: EIssuesStoreType;
};

export const SubIssuesListRoot = observer(function SubIssuesListRoot(props: Props) {
  const {
    workspaceSlug,
    projectId,
    parentIssueId,
    rootIssueId,
    canEdit,
    handleIssueCrudState,
    subIssueOperations,
    issueServiceType = EIssueServiceType.ISSUES,
    storeType = EIssuesStoreType.PROJECT,
    spacingLeft = 0,
  } = props;
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [subscriptions] = useState(() => new Map<string, () => void>());
  // store hooks
  const {
    issue: { getIssueById },
    subIssues: {
      subIssuesByIssueId,
      subscribeToSubIssues,
      filters: { getSubIssueFilters, getGroupedSubWorkItems, getFilteredSubWorkItems, resetFilters },
    },
  } = useIssueDetail(issueServiceType);
  // Descendants of epic work items are ordinary work items, just as in the detail view.
  const {
    issue: { getIssueById: getNestedIssueById },
    subIssues: {
      subIssuesByIssueId: getNestedChildIds,
      subIssueHelpersByIssueId,
      subscribeToSubIssues: subscribeToNestedSubIssues,
    },
  } = useIssueDetail();

  const filters = getSubIssueFilters(rootIssueId);
  const isRootLevel = rootIssueId === parentIssueId;
  const group_by = isRootLevel ? (filters?.displayFilters?.group_by ?? null) : null;
  const filteredSubWorkItemsCount = (getFilteredSubWorkItems(rootIssueId, filters.filters ?? {}) ?? []).length;
  const groups = getGroupByColumns({
    groupBy: group_by as GroupByColumnTypes,
    includeNone: true,
    isWorkspaceLevel: isWorkspaceLevel(storeType),
    isEpic: issueServiceType === EIssueServiceType.EPICS,
    projectId,
  });
  const groupedSubIssues = isRootLevel ? getGroupedSubWorkItems(rootIssueId) : undefined;
  const rows = buildSubIssueVirtualRows({
    groups: (groups ?? []).map((group) => ({
      group,
      issueIds: isRootLevel ? (groupedSubIssues?.[group.id] ?? []) : (subIssuesByIssueId(parentIssueId) ?? []),
      isExpanded: group.id === ALL_ISSUES || !collapsedGroups.has(group.id),
    })),
    parentIssueId,
    rootIssueId,
    projectId,
    spacingLeft,
    issueServiceType,
    getIssue: (issueId, serviceType) =>
      serviceType === issueServiceType ? getIssueById(issueId) : getNestedIssueById(issueId),
    getChildIds: getNestedChildIds,
    getExpandedIssueIds: (issueId) => subIssueHelpersByIssueId(issueId).issue_visibility,
  });
  const { listRef, virtualizer, scrollMargin } = useSubIssueVirtualizer(rows);

  // Keep refresh subscriptions tied to the expanded model, not mounted virtual rows.
  useEffect(() => {
    const activeKeys = new Set<string>();
    const subscribe = (id: string, parentProjectId: string, serviceType: TIssueServiceType) => {
      const key = JSON.stringify([workspaceSlug, parentProjectId, id, serviceType]);
      activeKeys.add(key);
      if (subscriptions.has(key)) return;
      const subscribeToParent = serviceType === issueServiceType ? subscribeToSubIssues : subscribeToNestedSubIssues;
      subscriptions.set(key, subscribeToParent(workspaceSlug, parentProjectId, id));
    };
    subscribe(parentIssueId, projectId, issueServiceType);
    for (const row of rows) {
      if (row.type === "issue" && row.expandedProjectId) {
        subscribe(row.issueId, row.expandedProjectId, EIssueServiceType.ISSUES);
      }
    }
    for (const [key, unsubscribe] of subscriptions) {
      if (activeKeys.has(key)) continue;
      unsubscribe();
      subscriptions.delete(key);
    }
  });

  useEffect(() => {
    return () => {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
    };
  }, [subscriptions]);

  const isSubWorkItems = issueServiceType === EIssueServiceType.ISSUES;

  return (
    <div ref={listRef} className="relative" data-sub-issues-list>
      {isRootLevel && filteredSubWorkItemsCount === 0 ? (
        <SectionEmptyState
          title={
            !isSubWorkItems
              ? t("sub_work_item.empty_state.list_filters.title")
              : t("sub_work_item.empty_state.sub_list_filters.title")
          }
          description={
            !isSubWorkItems
              ? t("sub_work_item.empty_state.list_filters.description")
              : t("sub_work_item.empty_state.sub_list_filters.description")
          }
          icon={<ListFilter />}
          customClassName={storeType !== EIssuesStoreType.EPIC ? "border-none" : ""}
          actionElement={
            <Button variant="secondary" onClick={() => resetFilters(rootIssueId)}>
              {t("sub_work_item.empty_state.list_filters.action")}
            </Button>
          }
        />
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            return (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 w-full"
                // `top` instead of `transform`: transforms trap inline `fixed` dropdown menus inside the row.
                style={{ top: virtualItem.start - scrollMargin }}
              >
                {row.type === "group" ? (
                  <SubIssuesListGroup
                    group={row.group}
                    count={row.count}
                    isExpanded={row.isExpanded}
                    onToggle={() =>
                      setCollapsedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(row.group.id)) next.delete(row.group.id);
                        else next.add(row.group.id);
                        return next;
                      })
                    }
                  />
                ) : (
                  <SubIssuesListItem
                    workspaceSlug={workspaceSlug}
                    projectId={row.projectId}
                    parentIssueId={row.parentIssueId}
                    rootIssueId={rootIssueId}
                    issueId={row.issueId}
                    canEdit={canEdit}
                    handleIssueCrudState={handleIssueCrudState}
                    subIssueOperations={subIssueOperations}
                    issueServiceType={row.issueServiceType}
                    spacingLeft={row.spacingLeft}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
