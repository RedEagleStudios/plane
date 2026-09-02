/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import type { TCustomVideoAttributes, VideoUploadEntity } from "./types";
import { ECustomVideoAttributeNames, ECustomVideoStatus } from "./types";

export const DEFAULT_CUSTOM_VIDEO_ATTRIBUTES: TCustomVideoAttributes = {
  [ECustomVideoAttributeNames.ID]: null,
  [ECustomVideoAttributeNames.SOURCE]: null,
  [ECustomVideoAttributeNames.STATUS]: ECustomVideoStatus.PENDING,
};

export const getVideoComponentFileMap = (editor: Editor): Map<string, VideoUploadEntity> | undefined =>
  editor.storage[CORE_EXTENSIONS.CUSTOM_VIDEO]?.fileMap;

export const hasVideoDuplicationFailed = (status: ECustomVideoStatus): boolean =>
  status === ECustomVideoStatus.DUPLICATION_FAILED;

export const getVideoBlockId = (id: string): string => `video-component-${id}`;
