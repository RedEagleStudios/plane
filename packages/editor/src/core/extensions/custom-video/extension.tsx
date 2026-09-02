/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
import { v4 as uuidv4 } from "uuid";
// constants
import { ACCEPTED_VIDEO_MIME_TYPES } from "@/constants/config";
// helpers
import { isFileValid } from "@/helpers/file";
import { insertEmptyParagraphAtNodeBoundaries } from "@/helpers/insert-empty-paragraph-at-node-boundary";
// types
import type { TFileHandler } from "@/types";
// local imports
import type { CustomVideoNodeViewProps } from "./components/node-view";
import { CustomVideoNodeView } from "./components/node-view";
import { CustomVideoExtensionConfig } from "./extension-config";
import type { CustomVideoExtensionOptions, CustomVideoExtensionStorage } from "./types";
import { ECustomVideoAttributeNames, ECustomVideoStatus } from "./types";
import { getVideoComponentFileMap } from "./utils";

type Props = {
  fileHandler: TFileHandler;
  isEditable: boolean;
};

export function CustomVideoExtension(props: Props) {
  const { fileHandler, isEditable } = props;
  const { getAssetDownloadSrc, getAssetSrc } = fileHandler;

  return CustomVideoExtensionConfig.extend<CustomVideoExtensionOptions, CustomVideoExtensionStorage>({
    selectable: isEditable,
    draggable: isEditable,

    addOptions() {
      const upload = "upload" in fileHandler ? fileHandler.upload : undefined;
      const duplicate = "duplicate" in fileHandler ? fileHandler.duplicate : undefined;
      return {
        ...this.parent?.(),
        getVideoDownloadSource: getAssetDownloadSrc,
        getVideoSource: getAssetSrc,
        uploadVideo: upload,
        duplicateVideo: duplicate,
      };
    },

    addStorage() {
      const maxFileSize = "validation" in fileHandler ? (fileHandler.validation?.maxFileSize ?? 0) : 0;
      return {
        fileMap: new Map(),
        deletedVideoSet: new Map<string, boolean>(),
        maxFileSize,
        markdown: {
          serialize() {},
        },
      };
    },

    addCommands() {
      return {
        insertVideoComponent:
          (videoProps) =>
          ({ commands }) => {
            if (
              videoProps.file &&
              !isFileValid({
                acceptedMimeTypes: ACCEPTED_VIDEO_MIME_TYPES,
                file: videoProps.file,
                maxFileSize: this.storage.maxFileSize,
                onError: (_error, message) => alert(message),
              })
            ) {
              return false;
            }

            const fileId = uuidv4();
            const fileMap = getVideoComponentFileMap(this.editor);
            if (videoProps.event === "drop" && videoProps.file) {
              fileMap?.set(fileId, { file: videoProps.file, event: videoProps.event });
            } else if (videoProps.event === "insert") {
              fileMap?.set(fileId, { event: videoProps.event, hasOpenedFileInputOnce: false });
            }

            const attributes = {
              [ECustomVideoAttributeNames.ID]: fileId,
              [ECustomVideoAttributeNames.STATUS]: ECustomVideoStatus.PENDING,
            };
            if (videoProps.pos) {
              return commands.insertContentAt(videoProps.pos, {
                type: this.name,
                attrs: attributes,
              });
            }
            return commands.insertContent({ type: this.name, attrs: attributes });
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        ArrowDown: insertEmptyParagraphAtNodeBoundaries("down", this.name),
        ArrowUp: insertEmptyParagraphAtNodeBoundaries("up", this.name),
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps) => (
        <CustomVideoNodeView {...nodeViewProps} node={nodeViewProps.node as CustomVideoNodeViewProps["node"]} />
      ));
    },
  });
}
