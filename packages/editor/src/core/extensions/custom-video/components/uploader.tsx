/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RotateCcw, VideoIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
// plane imports
import { cn } from "@plane/utils";
// constants
import { ACCEPTED_VIDEO_MIME_TYPES } from "@/constants/config";
import { CORE_EXTENSIONS } from "@/constants/extension";
// helpers
import type { EFileError } from "@/helpers/file";
// hooks
import { uploadFirstFileAndInsertRemaining, useDropZone, useUploader } from "@/hooks/use-file-upload";
// local imports
import { ECustomVideoStatus } from "../types";
import { getVideoComponentFileMap } from "../utils";
import type { CustomVideoNodeViewProps } from "./node-view";

type Props = CustomVideoNodeViewProps & {
  failedToLoadVideo: boolean;
  hasDuplicationFailed: boolean;
  maxFileSize: number;
};

export function CustomVideoUploader(props: Props) {
  const {
    editor,
    extension,
    failedToLoadVideo,
    getPos,
    hasDuplicationFailed,
    maxFileSize,
    node,
    selected,
    updateAttributes,
  } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasTriggeredFilePickerRef = useRef(false);
  const hasTriedUploadingOnMountRef = useRef(false);
  const { id: videoEntityId } = node.attrs;
  const videoComponentFileMap = useMemo(() => getVideoComponentFileMap(editor), [editor]);
  const isTouchDevice = !!editor.storage.utility.isTouchDevice;

  const onUpload = useCallback(
    (assetId: string) => {
      if (!assetId || !videoEntityId) return;

      updateAttributes({
        src: assetId,
        status: ECustomVideoStatus.UPLOADED,
      });
      videoComponentFileMap?.delete(videoEntityId);

      const pos = getPos();
      const selection = editor.state.selection;
      const currentNode = editor.state.doc.nodeAt(selection.from);
      if (
        currentNode &&
        currentNode.type.name === node.type.name &&
        currentNode.attrs.src === assetId &&
        pos !== undefined
      ) {
        const nextNode = editor.state.doc.nodeAt(pos + 1);
        if (nextNode?.type.name === CORE_EXTENSIONS.PARAGRAPH) editor.commands.setTextSelection(pos + 1);
        else editor.commands.createParagraphNear();
      }
    },
    [editor, getPos, node.type.name, updateAttributes, videoComponentFileMap, videoEntityId]
  );

  const uploadVideoEditorCommand = useCallback(
    async (file: File) => {
      updateAttributes({ status: ECustomVideoStatus.UPLOADING });
      return await extension.options.uploadVideo?.(videoEntityId ?? "", file);
    },
    [extension.options, updateAttributes, videoEntityId]
  );

  const handleProgressStatus = useCallback(
    (isUploading: boolean) => {
      editor.storage.utility.uploadInProgress = isUploading;
    },
    [editor]
  );

  const handleInvalidFile = useCallback((_error: EFileError, _file: File, message: string) => {
    alert(message);
  }, []);

  const { isUploading, uploadFile } = useUploader({
    acceptedMimeTypes: ACCEPTED_VIDEO_MIME_TYPES,
    editorCommand: uploadVideoEditorCommand,
    handleProgressStatus,
    maxFileSize,
    onInvalidFile: handleInvalidFile,
    onUpload,
  });

  const { draggedInside, onDrop, onDragEnter, onDragLeave } = useDropZone({
    editor,
    getPos,
    type: "video",
    uploader: uploadFile,
  });

  useEffect(() => {
    if (hasTriedUploadingOnMountRef.current) return;

    const metadata = videoComponentFileMap?.get(videoEntityId ?? "");
    if (metadata?.event === "drop" && "file" in metadata) {
      hasTriedUploadingOnMountRef.current = true;
      void uploadFile(metadata.file);
    } else if (metadata?.event === "insert" && fileInputRef.current && !hasTriggeredFilePickerRef.current) {
      if (metadata.hasOpenedFileInputOnce) return;
      if (!isTouchDevice) fileInputRef.current.click();
      hasTriggeredFilePickerRef.current = true;
      videoComponentFileMap?.set(videoEntityId ?? "", { ...metadata, hasOpenedFileInputOnce: true });
    } else if (!metadata) {
      hasTriedUploadingOnMountRef.current = true;
    }
  }, [isTouchDevice, uploadFile, videoComponentFileMap, videoEntityId]);

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      event.preventDefault();
      const filesList = event.target.files;
      const pos = getPos();
      if (!filesList || pos === undefined) return;

      await uploadFirstFileAndInsertRemaining({
        editor,
        filesList,
        pos,
        type: "video",
        uploader: uploadFile,
      });
    },
    [editor, getPos, uploadFile]
  );

  const isErrorState = failedToLoadVideo || hasDuplicationFailed;
  const message = isErrorState
    ? "Error loading video"
    : isUploading
      ? "Uploading..."
      : draggedInside && editor.isEditable
        ? "Drop video here"
        : "Add a video";

  const handleRetryClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (hasDuplicationFailed && editor.isEditable) {
        updateAttributes({ status: ECustomVideoStatus.DUPLICATING });
      }
    },
    [editor.isEditable, hasDuplicationFailed, updateAttributes]
  );

  return (
    <div
      className={cn(
        "video-upload-component flex cursor-default items-center justify-start gap-2 rounded-lg border border-dashed bg-layer-3 px-2 py-3 text-tertiary transition-all duration-200 ease-in-out",
        {
          "border-subtle": !(selected && editor.isEditable && !isErrorState),
          "cursor-pointer hover:bg-layer-3-hover hover:text-secondary": editor.isEditable && !hasDuplicationFailed,
          "bg-layer-3-hover text-secondary": draggedInside && editor.isEditable && !isErrorState,
          "bg-accent-primary/10 text-accent-secondary": selected && editor.isEditable && !isErrorState,
          "bg-danger-subtle text-danger-primary": isErrorState,
        }
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragEnter}
      onDrop={onDrop}
      contentEditable={false}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left"
        disabled={!editor.isEditable || hasDuplicationFailed}
        onClick={() => fileInputRef.current?.click()}
      >
        <VideoIcon className="size-4" />
        <span className="flex-1 text-14 font-medium">{message}</span>
      </button>
      {hasDuplicationFailed && editor.isEditable && (
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-danger-primary hover:bg-danger-subtle-hover"
          onClick={handleRetryClick}
          title="Retry duplication"
        >
          <RotateCcw className="size-3" />
          <span className="text-11">Retry</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        className="size-0 overflow-hidden"
        hidden
        type="file"
        accept={ACCEPTED_VIDEO_MIME_TYPES.join(",")}
        multiple
        onChange={onFileChange}
      />
    </div>
  );
}
