/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseGroupedSpreadsheetRoot } from "../base-grouped-spreadsheet-root";

export const ProjectViewGroupedSpreadsheetLayout = observer(function ProjectViewGroupedSpreadsheetLayout() {
  const { viewId } = useParams();
  if (!viewId) return null;

  return <BaseGroupedSpreadsheetRoot QuickActions={ProjectIssueQuickActions} viewId={viewId.toString()} />;
});
