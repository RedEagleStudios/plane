/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { ProjectSettingsFeatureControlItem } from "@/components/settings/project/content/feature-control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesModulesProjectSettingsHeader } from "./header";

function FeaturesModulesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  // translation
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} settings - ${t("project_settings.features.modules.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesModulesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.modules.title")}
          description={t("project_settings.features.modules.description")}
        />
        <div className="mt-7 space-y-4">
          <ProjectSettingsFeatureControlItem
            title={t("project_settings.features.modules.toggle_title")}
            description={t("project_settings.features.modules.toggle_description")}
            featureProperty="module_view"
            projectId={projectId}
            value={!!currentProjectDetails?.module_view}
            workspaceSlug={workspaceSlug}
          />
          <ProjectSettingsFeatureControlItem
            title="Limit work items to one module"
            description="Selecting a new module replaces the current module. Existing multi-module work items are unchanged until edited."
            disabled={!currentProjectDetails?.module_view}
            featureProperty="single_module_per_issue"
            projectId={projectId}
            value={!!currentProjectDetails?.single_module_per_issue}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesModulesSettingsPage);
