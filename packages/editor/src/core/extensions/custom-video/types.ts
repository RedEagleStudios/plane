/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node } from "@tiptap/core";
// types
import type { TFileHandler } from "@/types";

export enum ECustomVideoAttributeNames {
  ID = "id",
  SOURCE = "src",
  STATUS = "status",
}

export enum ECustomVideoStatus {
  PENDING = "pending",
  UPLOADING = "uploading",
  UPLOADED = "uploaded",
  DUPLICATING = "duplicating",
  DUPLICATION_FAILED = "duplication-failed",
}

export type TCustomVideoAttributes = {
  [ECustomVideoAttributeNames.ID]: string | null;
  [ECustomVideoAttributeNames.SOURCE]: string | null;
  [ECustomVideoAttributeNames.STATUS]: ECustomVideoStatus;
};

export type VideoUploadEntity = ({ event: "insert" } | { event: "drop"; file: File }) & {
  hasOpenedFileInputOnce?: boolean;
};

export type InsertVideoComponentProps = {
  file?: File;
  pos?: number;
  event: "insert" | "drop";
};

export type CustomVideoExtensionOptions = {
  getVideoDownloadSource: TFileHandler["getAssetDownloadSrc"];
  getVideoSource: TFileHandler["getAssetSrc"];
  uploadVideo?: TFileHandler["upload"];
  duplicateVideo?: TFileHandler["duplicate"];
};

export type CustomVideoExtensionStorage = {
  fileMap: Map<string, VideoUploadEntity>;
  deletedVideoSet: Map<string, boolean>;
  maxFileSize: number;
};

export type CustomVideoExtensionType = Node<CustomVideoExtensionOptions, CustomVideoExtensionStorage>;
