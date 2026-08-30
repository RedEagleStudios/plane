/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { getDate, getDescriptionPlaceholderI18n, isEmptyHtmlString, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { RichTextEditor } from "@/components/editor/rich-text";
import { IssuePropertyLabels } from "@/components/issues/issue-layouts/properties";
import { WithDisplayPropertiesHOC } from "@/components/issues/issue-layouts/properties/with-display-properties-HOC";
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useLabel } from "@/hooks/store/use-label";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { SPREADSHEET_COLUMNS } from "../../utils";
import type { TQuickAddIssueForm } from "../root";
import { isQuickAddEditableProperty, QUICK_ADD_DROPDOWN_PLACEMENT } from "../quick-add.utils";

const workspaceService = new WorkspaceService();

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
    isSubmitting,
    onAssetUpload,
  } = props;
  const { t } = useTranslation();
  const editorRef = useRef<EditorRefApi | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const { workspaceSlug } = useParams();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug?.toString())?.id ?? "";
  const formValues = watch();
  const issue = {
    ...DEFAULT_WORK_ITEM_FORM_VALUES,
    ...prePopulatedData,
    ...formValues,
    project_id: formValues.project_id || prePopulatedData?.project_id || projectDetail.id,
  } as TIssue;

  const hasDescription = !isEmptyHtmlString(formValues.description_html ?? "<p></p>", ["img"]);

  useEffect(() => {
    if (!formValues.description_html || formValues.description_html === "<p></p>") {
      editorRef.current?.clearEditor();
      setIsDescriptionOpen(false);
    }
  }, [formValues.description_html]);

  const handleOpenDescription = () => {
    setIsDescriptionOpen(true);
    requestAnimationFrame(() => editorRef.current?.focus("end"));
  };

  const handleCancelDescription = () => {
    editorRef.current?.clearEditor();
    setValue("description_html", "<p></p>", { shouldDirty: true });
    setIsDescriptionOpen(false);
  };

  return (
    <div className="pb-2">
      <form ref={ref} onSubmit={onSubmit} className="z-10 w-full bg-surface-1 shadow-raised-200">
        <div className="horizontal-scrollbar overflow-x-auto">
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
                      onKeyDown={(event) => {
                        const shouldOpenDescription =
                          event.key === "Enter" && (event.shiftKey || event.ctrlKey || event.metaKey);
                        if (!shouldOpenDescription) return;
                        event.preventDefault();
                        handleOpenDescription();
                      }}
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
        </div>
        <div className="border-x-[0.5px] border-b-[0.5px] border-subtle bg-surface-1">
          {isDescriptionOpen && workspaceSlug && (
            <div
              className="border-b-[0.5px] border-subtle px-page-x py-2"
              onKeyDownCapture={(event) => {
                const shouldSubmit = event.key === "Enter" && (event.ctrlKey || event.metaKey);
                if (!shouldSubmit) return;
                event.preventDefault();
                event.stopPropagation();
                onSubmit();
              }}
            >
              <RichTextEditor
                editable
                autofocus
                id="spreadsheet-quick-add-editor"
                initialValue={formValues.description_html ?? "<p></p>"}
                workspaceSlug={workspaceSlug.toString()}
                workspaceId={workspaceId}
                projectId={projectDetail.id}
                onChange={(_description: object, descriptionHtml: string) =>
                  setValue("description_html", descriptionHtml, { shouldDirty: true })
                }
                ref={editorRef}
                placeholder={(isFocused, description) => t(getDescriptionPlaceholderI18n(isFocused, description))}
                searchMentionCallback={async (payload) =>
                  await workspaceService.searchEntity(workspaceSlug.toString(), {
                    ...payload,
                    project_id: projectDetail.id,
                  })
                }
                containerClassName="min-h-32 max-h-64 overflow-y-auto pt-3"
                uploadFile={async (blockId, file) => {
                  const { asset_id } = await uploadEditorAsset({
                    blockId,
                    data: {
                      entity_identifier: "",
                      entity_type: EFileAssetType.ISSUE_DESCRIPTION,
                    },
                    file,
                    projectId: projectDetail.id,
                    workspaceSlug: workspaceSlug.toString(),
                  });
                  onAssetUpload(asset_id);
                  return asset_id;
                }}
                duplicateFile={async (assetId) => {
                  const { asset_id } = await duplicateEditorAsset({
                    assetId,
                    entityType: EFileAssetType.ISSUE_DESCRIPTION,
                    projectId: projectDetail.id,
                    workspaceSlug: workspaceSlug.toString(),
                  });
                  onAssetUpload(asset_id);
                  return asset_id;
                }}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-page-x py-2">
            <button
              type="button"
              className="text-12 font-medium text-secondary hover:text-primary"
              onClick={handleOpenDescription}
            >
              {hasDescription ? "Edit description" : "Add description"}
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden text-11 text-placeholder md:inline">
                {isDescriptionOpen
                  ? "Ctrl/⌘ + Enter to create · Enter for a new line"
                  : "Enter to create · Shift/Ctrl/⌘ + Enter to add description"}
              </span>
              {isDescriptionOpen && (
                <Button type="button" variant="secondary" size="sm" onClick={handleCancelDescription}>
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                disabled={isSubmitting || !formValues.name?.trim()}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
});
