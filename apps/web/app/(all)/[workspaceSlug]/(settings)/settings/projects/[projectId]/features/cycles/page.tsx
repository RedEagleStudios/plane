/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setPromiseToast } from "@plane/propel/toast";
import type { IProject } from "@plane/types";
// components
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectSettingsFeatureControlItem } from "@/components/settings/project/content/feature-control-item";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesCyclesProjectSettingsHeader } from "./header";
import { SettingsHeading } from "@/components/settings/heading";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function FeaturesCyclesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails, updateProject } = useProject();
  // translation
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} settings - ${t("project_settings.features.cycles.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  const handleCadenceUpdate = (payload: Partial<IProject>) => {
    const updatePromise = updateProject(workspaceSlug, projectId, payload);
    setPromiseToast(updatePromise, {
      loading: "Updating cycle schedule...",
      success: {
        title: "Success!",
        message: () => "Cycle schedule updated successfully.",
      },
      error: {
        title: "Error!",
        message: () => "Cycle schedule could not be updated.",
      },
    });
  };

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesCyclesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.cycles.title")}
          description={t("project_settings.features.cycles.description")}
        />
        <div className="mt-7 space-y-4">
          <ProjectSettingsFeatureControlItem
            title={t("project_settings.features.cycles.toggle_title")}
            description={t("project_settings.features.cycles.toggle_description")}
            featureProperty="cycle_view"
            projectId={projectId}
            value={!!currentProjectDetails?.cycle_view}
            workspaceSlug={workspaceSlug}
          />
          <ProjectSettingsFeatureControlItem
            title="Create cycles automatically"
            description="Creates the next cycle one day before its configured start day. The name increments automatically, for example Sprint 1 → Sprint 2."
            disabled={!currentProjectDetails?.cycle_view}
            featureProperty="weekly_cycle_auto_create"
            projectId={projectId}
            value={!!currentProjectDetails?.weekly_cycle_auto_create}
            workspaceSlug={workspaceSlug}
          />
          <SettingsBoxedControlItem
            title="Cycle start day"
            description="The scheduler creates the next cycle on the preceding day in the project's timezone."
            control={
              <select
                aria-label="Cycle start day"
                value={currentProjectDetails?.weekly_cycle_start_weekday ?? 5}
                onChange={(event) =>
                  handleCadenceUpdate({ weekly_cycle_start_weekday: Number(event.currentTarget.value) })
                }
                disabled={!currentProjectDetails?.cycle_view || !currentProjectDetails?.weekly_cycle_auto_create}
                className="h-8 min-w-32 rounded-md border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
              >
                {WEEKDAYS.map((weekday, index) => (
                  <option key={weekday} value={index}>
                    {weekday}
                  </option>
                ))}
              </select>
            }
          />
          <SettingsBoxedControlItem
            title="Cycle duration"
            description="Number of calendar days in each automatically created cycle."
            control={
              <div className="flex items-center gap-2">
                <input
                  key={currentProjectDetails?.weekly_cycle_duration_days}
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={currentProjectDetails?.weekly_cycle_duration_days ?? 7}
                  aria-label="Cycle duration in days"
                  disabled={!currentProjectDetails?.cycle_view || !currentProjectDetails?.weekly_cycle_auto_create}
                  onBlur={(event) => {
                    const duration = Number(event.currentTarget.value);
                    if (!Number.isInteger(duration) || duration < 1 || duration > 90) {
                      event.currentTarget.value = String(currentProjectDetails?.weekly_cycle_duration_days ?? 7);
                      return;
                    }
                    handleCadenceUpdate({ weekly_cycle_duration_days: duration });
                  }}
                  className="h-8 w-20 rounded-md border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none"
                />
                <span className="text-12 text-tertiary">days</span>
              </div>
            }
          />
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesCyclesSettingsPage);
