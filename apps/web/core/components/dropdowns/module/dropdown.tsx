/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
// types
import type { TDropdownProps } from "../types";
// local imports
import { ModuleDropdownBase } from "./base";

type TModuleDropdownProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  projectId: string | undefined;
  showCount?: boolean;
  onClose?: () => void;
  renderByDefault?: boolean;
  itemClassName?: string;
} & (
    | {
        multiple: false;
        onChange: (val: string | null) => void;
        value: string | null;
      }
    | {
        multiple: true;
        onChange: (val: string[]) => void;
        value: string[] | null;
      }
  );

export const ModuleDropdown = observer(function ModuleDropdown(props: TModuleDropdownProps) {
  const { projectId, multiple, onChange, value, ...dropdownProps } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { getModuleById, getProjectModuleIds, fetchModules } = useModule();
  const { getProjectById } = useProject();
  // derived values
  const moduleIds = projectId ? getProjectModuleIds(projectId) : [];
  const isSingleModuleProject = projectId ? !!getProjectById(projectId)?.single_module_per_issue : false;

  const onDropdownOpen = () => {
    if (!moduleIds && projectId && workspaceSlug) fetchModules(workspaceSlug.toString(), projectId);
  };

  const sharedProps = {
    ...dropdownProps,
    projectId,
    getModuleById,
    moduleIds: moduleIds ?? [],
    onDropdownOpen,
  };

  if (multiple && isSingleModuleProject) {
    return (
      <ModuleDropdownBase
        {...sharedProps}
        multiple={false}
        value={value?.[0] ?? null}
        onChange={(moduleId) => onChange(moduleId ? [moduleId] : [])}
      />
    );
  }

  if (multiple) {
    return <ModuleDropdownBase {...sharedProps} multiple value={value} onChange={onChange} />;
  }

  return <ModuleDropdownBase {...sharedProps} multiple={false} value={value} onChange={onChange} />;
});
