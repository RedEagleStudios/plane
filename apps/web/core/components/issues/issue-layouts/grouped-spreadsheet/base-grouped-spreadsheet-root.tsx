/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EIssueFilterType, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type {
  EIssuesStoreType,
  GroupByColumnTypes,
  IIssueDisplayFilterOptions,
  TGroupedIssues,
  TIssue,
  TIssueKanbanFilters,
} from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { IssueLayoutHOC } from "../issue-layout-HOC";
import type { IQuickActionProps, TRenderQuickActions } from "../list/list-view-types";
import { GroupedSpreadsheetView } from "./grouped-spreadsheet-view";

export type GroupedSpreadsheetStoreType = EIssuesStoreType.PROJECT;

interface Props {
  QuickActions: FC<IQuickActionProps>;
  canEditPropertiesBasedOnProject?: (projectId: string) => boolean;
}

export const BaseGroupedSpreadsheetRoot = observer(function BaseGroupedSpreadsheetRoot(props: Props) {
  const { QuickActions, canEditPropertiesBasedOnProject } = props;
  const { workspaceSlug, projectId } = useParams();
  const storeType = useIssueStoreType() as GroupedSpreadsheetStoreType;
  const { issues, issuesFilter, issueMap } = useIssues(storeType);
  const {
    fetchIssues,
    fetchNextIssues,
    quickAddIssue,
    updateIssue,
    removeIssue,
    archiveIssue,
    restoreIssue,
    updateFilters,
  } = useIssuesActions(storeType);
  const { allowPermissions } = useUserPermissions();

  const displayFilters = issuesFilter.issueFilters?.displayFilters;
  const groupBy = (displayFilters?.group_by ?? "cycle") as GroupByColumnTypes;
  const showEmptyGroups = displayFilters?.show_empty_groups ?? false;
  const collapsedGroups =
    issuesFilter.issueFilters?.kanbanFilters ?? ({ group_by: [], sub_group_by: [] } as TIssueKanbanFilters);
  const { enableInlineEditing, enableQuickAdd, enableIssueCreation } = issues.viewFlags ?? {};

  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  useEffect(() => {
    if (!projectId) return;
    if (!displayFilters?.group_by) {
      updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_FILTERS, { group_by: "cycle" });
      return;
    }
    fetchIssues("init-loader", { canGroup: true, perPageCount: 100 });
  }, [displayFilters?.group_by, fetchIssues, projectId, updateFilters]);

  const canEditProperties = useCallback(
    (currentProjectId: string | undefined) => {
      const projectPermission =
        canEditPropertiesBasedOnProject && currentProjectId
          ? canEditPropertiesBasedOnProject(currentProjectId)
          : isEditingAllowed;
      return !!enableInlineEditing && projectPermission;
    },
    [canEditPropertiesBasedOnProject, enableInlineEditing, isEditingAllowed]
  );

  const handleDisplayFiltersUpdate = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!projectId) return;
      updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_FILTERS, updatedDisplayFilter);
    },
    [projectId, updateFilters]
  );

  const handleCollapsedGroups = useCallback(
    (groupId: string) => {
      if (!projectId || !workspaceSlug) return;
      const currentCollapsedGroups = issuesFilter.issueFilters?.kanbanFilters?.group_by ?? [];
      const group_by = currentCollapsedGroups.includes(groupId)
        ? currentCollapsedGroups.filter((value) => value !== groupId)
        : [...currentCollapsedGroups, groupId];
      updateFilters(projectId.toString(), EIssueFilterType.KANBAN_FILTERS, {
        group_by,
        sub_group_by: collapsedGroups.sub_group_by,
      });
    },
    [
      collapsedGroups.sub_group_by,
      issuesFilter.issueFilters?.kanbanFilters?.group_by,
      projectId,
      updateFilters,
      workspaceSlug,
    ]
  );

  const renderQuickActions: TRenderQuickActions = useCallback(
    ({ issue, parentRef, customActionButton, placement, portalElement }) => (
      <QuickActions
        parentRef={parentRef}
        customActionButton={customActionButton}
        issue={issue}
        handleDelete={async () => removeIssue(issue.project_id, issue.id)}
        handleUpdate={async (data) => updateIssue?.(issue.project_id, issue.id, data)}
        handleArchive={async () => archiveIssue?.(issue.project_id, issue.id)}
        handleRestore={async () => restoreIssue?.(issue.project_id, issue.id)}
        portalElement={portalElement}
        readOnly={!canEditProperties(issue.project_id ?? undefined)}
        placements={placement}
      />
    ),
    [QuickActions, archiveIssue, canEditProperties, removeIssue, restoreIssue, updateIssue]
  );

  if (!displayFilters?.group_by) return null;

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.GROUPED_SPREADSHEET}>
      <GroupedSpreadsheetView
        displayProperties={issuesFilter.issueFilters?.displayProperties ?? {}}
        displayFilters={displayFilters}
        handleDisplayFilterUpdate={handleDisplayFiltersUpdate}
        groupedIssueIds={(issues.groupedIssueIds ?? {}) as TGroupedIssues}
        issueMap={issueMap}
        groupBy={groupBy}
        quickActions={renderQuickActions}
        updateIssue={
          updateIssue as
            | ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>)
            | undefined
        }
        canEditProperties={canEditProperties}
        quickAddCallback={quickAddIssue}
        enableQuickCreateIssue={enableQuickAdd}
        disableIssueCreation={!enableIssueCreation || !isEditingAllowed}
        showEmptyGroups={showEmptyGroups}
        collapsedGroups={collapsedGroups}
        handleCollapsedGroups={handleCollapsedGroups}
        loadMoreIssues={fetchNextIssues}
      />
    </IssueLayoutHOC>
  );
});
