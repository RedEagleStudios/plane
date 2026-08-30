/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { IssuePropertyLabels } from "@/components/issues/issue-layouts/properties";
import { WithDisplayPropertiesHOC } from "@/components/issues/issue-layouts/properties/with-display-properties-HOC";
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { useLabel } from "@/hooks/store/use-label";
import { SPREADSHEET_COLUMNS } from "../../utils";
import type { TQuickAddIssueForm } from "../root";
import { isQuickAddEditableProperty, QUICK_ADD_DROPDOWN_PLACEMENT } from "../quick-add.utils";

type QuickAddSpreadsheetColumnProps = Pick<TQuickAddIssueForm, "displayProperties" | "setValue"> & {
  issue: TIssue;
  property: keyof IIssueDisplayProperties;
};

const QuickAddSpreadsheetColumn = observer(function QuickAddSpreadsheetColumn(props: QuickAddSpreadsheetColumnProps) {
  const { displayProperties = {}, issue, property, setValue } = props;
  const cellRef = useRef<HTMLTableCellElement | null>(null);
  const Column = SPREADSHEET_COLUMNS[property];
  const { labelMap } = useLabel();
  const defaultLabelOptions =
    issue.label_ids?.flatMap((labelId) => {
      const label = labelMap[labelId];
      return label ? [label] : [];
    }) ?? [];

  if (!Column) return null;

  const handleChange = (_issue: TIssue, data: Partial<TIssue>) => {
    for (const [field, value] of Object.entries(data)) {
      setValue(field as keyof TIssue, value as never, { shouldDirty: true });
    }
  };
  const handleClose = () => cellRef.current?.focus();
  const renderEditableColumn = () => {
    switch (property) {
      case "state":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <StateDropdown
              projectId={issue.project_id ?? undefined}
              value={issue.state_id}
              onChange={(stateId) => setValue("state_id", stateId, { shouldDirty: true })}
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              buttonVariant="transparent-with-text"
              buttonClassName="rounded-none px-page-x text-left"
              buttonContainerClassName="w-full"
              onClose={handleClose}
              showTooltip
            />
          </div>
        );
      case "priority":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <PriorityDropdown
              value={issue.priority}
              onChange={(priority) => setValue("priority", priority, { shouldDirty: true })}
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              buttonVariant="transparent-with-text"
              buttonClassName="rounded-none px-page-x text-left"
              buttonContainerClassName="w-full"
              onClose={handleClose}
            />
          </div>
        );
      case "labels":
        return (
          <div className="h-11 w-full border-b-[0.5px] border-subtle">
            <IssuePropertyLabels
              projectId={issue.project_id ?? null}
              value={issue.label_ids ?? []}
              defaultOptions={defaultLabelOptions}
              onChange={(labelIds) => setValue("label_ids", labelIds, { shouldDirty: true })}
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              className="h-full w-full"
              buttonClassName="h-full w-full rounded-none px-page-x"
              hideDropdownArrow
              maxRender={1}
              placeholderText="Select labels"
              onClose={handleClose}
              noLabelBorder
              fullWidth
              fullHeight
            />
          </div>
        );
      case "start_date":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <DateDropdown
              value={issue.start_date}
              maxDate={getDate(issue.target_date)}
              onChange={(date) =>
                setValue("start_date", date ? (renderFormattedPayloadDate(date) ?? null) : null, { shouldDirty: true })
              }
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              placeholder="Start date"
              icon={<StartDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
              buttonVariant="transparent-with-text"
              buttonClassName="rounded-none px-page-x text-left"
              buttonContainerClassName="w-full"
              optionsClassName="z-[9]"
              onClose={handleClose}
            />
          </div>
        );
      case "due_date":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <DateDropdown
              value={issue.target_date}
              minDate={getDate(issue.start_date)}
              onChange={(date) =>
                setValue("target_date", date ? (renderFormattedPayloadDate(date) ?? null) : null, { shouldDirty: true })
              }
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              placeholder="Due date"
              icon={<DueDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
              buttonVariant="transparent-with-text"
              buttonClassName="rounded-none px-page-x text-left"
              buttonContainerClassName="w-full"
              optionsClassName="z-[9]"
              onClose={handleClose}
            />
          </div>
        );
      case "estimate":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <EstimateDropdown
              value={issue.estimate_point ?? undefined}
              onChange={(estimatePoint) => setValue("estimate_point", estimatePoint ?? null, { shouldDirty: true })}
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              placeholder="Estimate"
              projectId={issue.project_id ?? undefined}
              buttonVariant="transparent-with-text"
              buttonClassName="rounded-none px-page-x text-left"
              buttonContainerClassName="w-full"
              onClose={handleClose}
            />
          </div>
        );
      case "cycle":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <CycleDropdown
              projectId={issue.project_id ?? undefined}
              value={issue.cycle_id}
              onChange={(cycleId) => setValue("cycle_id", cycleId, { shouldDirty: true })}
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              placeholder="Select cycle"
              buttonVariant="transparent-with-text"
              buttonContainerClassName="w-full relative flex items-center p-2 px-page-x"
              buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent px-0"
              onClose={handleClose}
            />
          </div>
        );
      case "modules":
        return (
          <div className="h-11 border-b-[0.5px] border-subtle">
            <ModuleDropdown
              projectId={issue.project_id ?? undefined}
              value={issue.module_ids ?? []}
              onChange={(moduleIds) => setValue("module_ids", moduleIds, { shouldDirty: true })}
              placement={QUICK_ADD_DROPDOWN_PLACEMENT}
              placeholder="Select modules"
              buttonVariant="transparent-with-text"
              buttonContainerClassName="w-full relative flex items-center p-2 px-page-x"
              buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent !px-0"
              onClose={handleClose}
              multiple
              showCount
              showTooltip
            />
          </div>
        );
      default:
        return <Column issue={issue} onChange={handleChange} disabled={false} onClose={handleClose} />;
    }
  };

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={property}
      shouldRenderProperty={() => shouldRenderColumn(property)}
    >
      <td ref={cellRef} className="h-11 min-w-36 border-r border-subtle text-13" tabIndex={0}>
        {isQuickAddEditableProperty(property) ? (
          renderEditableColumn()
        ) : (
          <div
            className="flex h-11 w-full items-center px-page-x text-12 text-placeholder"
            title="Set after work item creation"
          >
            —
          </div>
        )}
      </td>
    </WithDisplayPropertiesHOC>
  );
});

export const SpreadsheetQuickAddIssueForm = observer(function SpreadsheetQuickAddIssueForm(props: TQuickAddIssueForm) {
  const {
    ref,
    projectDetail,
    register,
    watch,
    setValue,
    prePopulatedData,
    displayProperties = {},
    spreadsheetColumnsList = [],
    onSubmit,
    isEpic,
  } = props;
  const { t } = useTranslation();
  const formValues = watch();
  const issue = {
    ...DEFAULT_WORK_ITEM_FORM_VALUES,
    ...prePopulatedData,
    ...formValues,
    project_id: formValues.project_id || prePopulatedData?.project_id || projectDetail.id,
  } as TIssue;

  return (
    <div className="pb-2">
      <div className="horizontal-scrollbar overflow-x-auto">
        <form ref={ref} onSubmit={onSubmit} className="z-10 min-w-max bg-surface-1 shadow-raised-200">
          <table className="w-full min-w-max border-collapse">
            <tbody>
              <tr className="border-[0.5px] border-t-0 border-subtle">
                <td className="h-11 w-[26rem] min-w-[26rem] border-r-[0.5px] border-subtle px-page-x">
                  <div className="flex h-full items-center gap-5">
                    {displayProperties.key && (
                      <span className="w-16 flex-shrink-0 text-11 leading-5 text-placeholder">
                        {projectDetail.identifier}
                      </span>
                    )}
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder={isEpic ? t("epic.title.label") : t("issue.title.label")}
                      {...register("name", {
                        required: isEpic ? t("epic.title.required") : t("issue.title.required"),
                      })}
                      className="h-full w-full bg-transparent text-13 leading-5 text-secondary outline-none"
                    />
                  </div>
                </td>
                {spreadsheetColumnsList.map((property) => (
                  <QuickAddSpreadsheetColumn
                    key={property}
                    displayProperties={displayProperties}
                    issue={issue}
                    property={property}
                    setValue={setValue}
                  />
                ))}
              </tr>
            </tbody>
          </table>
        </form>
      </div>
      <p className="mt-3 ml-3 text-11 text-secondary italic">
        {isEpic ? t("epic.add.press_enter") : t("issue.add.press_enter")}
      </p>
    </div>
  );
});
