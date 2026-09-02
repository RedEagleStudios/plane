/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { v4 as uuidv4 } from "uuid";
import { ECustomImageAttributeNames, ECustomImageStatus } from "@/extensions/custom-image/types";
import { ECustomVideoAttributeNames, ECustomVideoStatus } from "@/extensions/custom-video/types";

export type AssetDuplicationContext = {
  element: Element;
  originalHtml: string;
};

export type AssetDuplicationResult = {
  modifiedHtml: string;
  shouldProcess: boolean;
};

export type AssetDuplicationHandler = (context: AssetDuplicationContext) => AssetDuplicationResult;

const imageComponentHandler: AssetDuplicationHandler = ({ element, originalHtml }) => {
  const src = element.getAttribute("src");

  if (!src || src.startsWith("http")) {
    return { modifiedHtml: originalHtml, shouldProcess: false };
  }

  // Capture the original HTML BEFORE making any modifications
  const originalTag = element.outerHTML;

  // Use setAttribute to update attributes
  const newId = uuidv4();
  element.setAttribute(ECustomImageAttributeNames.STATUS, ECustomImageStatus.DUPLICATING);
  element.setAttribute(ECustomImageAttributeNames.ID, newId);

  // Get the modified HTML AFTER the changes
  const modifiedTag = element.outerHTML;
  const modifiedHtml = originalHtml.replaceAll(originalTag, modifiedTag);

  return { modifiedHtml, shouldProcess: true };
};

const videoComponentHandler: AssetDuplicationHandler = ({ element, originalHtml }) => {
  const src = element.getAttribute("src");

  if (!src || src.startsWith("http")) {
    return { modifiedHtml: originalHtml, shouldProcess: false };
  }

  const originalTag = element.outerHTML;
  const newId = uuidv4();
  element.setAttribute(ECustomVideoAttributeNames.STATUS, ECustomVideoStatus.DUPLICATING);
  element.setAttribute(ECustomVideoAttributeNames.ID, newId);

  return {
    modifiedHtml: originalHtml.replaceAll(originalTag, element.outerHTML),
    shouldProcess: true,
  };
};

export const assetDuplicationHandlers: Record<string, AssetDuplicationHandler> = {
  "image-component": imageComponentHandler,
  "video-component": videoComponentHandler,
};
