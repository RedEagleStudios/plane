/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { MoreHorizontal, Pin, PinOff } from "lucide-react";
// types
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectView } from "@plane/types";
import { EViewAccess } from "@plane/types";
// ui
import type { TContextMenuItem } from "@plane/ui";
import { ContextMenu, CustomMenu } from "@plane/ui";
import { copyUrlToClipboard, cn } from "@plane/utils";
// helpers
import { useViewMenuItems } from "@/components/common/quick-actions-helper";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useViewPublish } from "@/components/views/publish";
// local imports
import { DeleteProjectViewModal } from "./delete-view-modal";
import { CreateUpdateProjectViewModal } from "./modal";

type Props = {
  parentRef: React.RefObject<HTMLElement>;
  projectId: string;
  view: IProjectView;
  workspaceSlug: string;
  customClassName?: string;
};

export const ViewQuickActions = observer(function ViewQuickActions(props: Props) {
  const { parentRef, projectId, view, workspaceSlug, customClassName } = props;
  // states
  const [createUpdateViewModal, setCreateUpdateViewModal] = useState(false);
  const [deleteViewModal, setDeleteViewModal] = useState(false);
  // store hooks
  const { data } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { updateViewPin } = useProjectView();
  // auth
  const isOwner = view?.owned_by === data?.id;
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);

  const { publishContextMenu } = useViewPublish(!!view.anchor, isAdmin || isOwner);

  const viewLink = `${workspaceSlug}/projects/${projectId}/views/${view.id}`;
  const handleCopyText = () =>
    // oxlint-disable-next-line promise/always-return
    copyUrlToClipboard(viewLink).then(() => {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Link Copied!",
        message: "View link copied to clipboard.",
      });
    });
  const handleOpenInNewTab = () => window.open(`/${viewLink}`, "_blank");
  const handleTogglePin = async () => {
    try {
      await updateViewPin(workspaceSlug, projectId, view.id, !view.is_pinned);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: view.is_pinned ? "View unpinned" : "View pinned",
        message: view.is_pinned
          ? "The view was removed from project navigation."
          : "The view is now available in project navigation.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Unable to update pinned view",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const menuResult = useViewMenuItems({
    isOwner,
    isAdmin,
    workspaceSlug,
    projectId,
    view,
    handleEdit: () => setCreateUpdateViewModal(true),
    handleDelete: () => setDeleteViewModal(true),
    handleCopyLink: handleCopyText,
    handleOpenInNewTab,
  });

  // Handle both CE (array) and EE (object) return types
  const MENU_ITEMS: TContextMenuItem[] = [...(Array.isArray(menuResult) ? menuResult : menuResult.items)];
  const additionalModals = Array.isArray(menuResult) ? null : menuResult.modals;

  if (publishContextMenu) MENU_ITEMS.splice(2, 0, publishContextMenu);

  if (isAdmin)
    MENU_ITEMS.unshift({
      key: "toggle_project_navigation_pin",
      title: view.is_pinned ? "Unpin from project navigation" : "Pin to project navigation",
      description:
        view.access === EViewAccess.PRIVATE && !view.is_pinned ? "Only public views can be pinned." : undefined,
      icon: view.is_pinned ? PinOff : Pin,
      action: handleTogglePin,
      disabled: view.access === EViewAccess.PRIVATE && !view.is_pinned,
    });

  const CONTEXT_MENU_ITEMS = MENU_ITEMS.map(function CONTEXT_MENU_ITEMS(item) {
    return {
      ...item,
      action: () => {
        item.action();
      },
    };
  });

  return (
    <>
      <CreateUpdateProjectViewModal
        isOpen={createUpdateViewModal}
        onClose={() => setCreateUpdateViewModal(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        data={view}
      />
      <DeleteProjectViewModal data={view} isOpen={deleteViewModal} onClose={() => setDeleteViewModal(false)} />
      {additionalModals}
      <ContextMenu parentRef={parentRef} items={CONTEXT_MENU_ITEMS} />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
        buttonClassName={customClassName}
      >
        {MENU_ITEMS.map((item) => {
          if (item.shouldRender === false) return null;
          return (
            <CustomMenu.MenuItem
              key={item.key}
              onClick={() => {
                item.action();
              }}
              className={cn(
                "flex items-center gap-2",
                {
                  "text-placeholder": item.disabled,
                },
                item.className
              )}
              disabled={item.disabled}
            >
              {item.icon && <item.icon className={cn("h-3 w-3", item.iconClassName)} />}
              <div>
                <h5>{item.title}</h5>
                {item.description && (
                  <p
                    className={cn("whitespace-pre-line text-tertiary", {
                      "text-placeholder": item.disabled,
                    })}
                  >
                    {item.description}
                  </p>
                )}
              </div>
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </>
  );
});
