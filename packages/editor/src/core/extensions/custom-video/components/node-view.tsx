/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
// local imports
import type { CustomVideoExtensionType, TCustomVideoAttributes } from "../types";
import { ECustomVideoAttributeNames, ECustomVideoStatus } from "../types";
import { hasVideoDuplicationFailed } from "../utils";
import { CustomVideoBlock } from "./block";
import { CustomVideoUploader } from "./uploader";

export type CustomVideoNodeViewProps = Omit<NodeViewProps, "extension" | "updateAttributes"> & {
  extension: CustomVideoExtensionType;
  node: NodeViewProps["node"] & {
    attrs: TCustomVideoAttributes;
  };
  updateAttributes: (attrs: Partial<TCustomVideoAttributes>) => void;
};

export function CustomVideoNodeView(props: CustomVideoNodeViewProps) {
  const { editor, extension, node, updateAttributes } = props;
  const { src: videoNodeSrc, status } = node.attrs;
  const [resolvedSrc, setResolvedSrc] = useState<string>();
  const [resolvedDownloadSrc, setResolvedDownloadSrc] = useState<string>();
  const [failedToLoadVideo, setFailedToLoadVideo] = useState(false);
  const hasRetriedOnMount = useRef(false);
  const isDuplicating = useRef(false);

  useEffect(() => {
    if (!videoNodeSrc) {
      setResolvedSrc(undefined);
      setResolvedDownloadSrc(undefined);
      return;
    }

    setResolvedSrc(undefined);
    setResolvedDownloadSrc(undefined);
    setFailedToLoadVideo(false);

    const resolveVideoSources = async () => {
      try {
        const [source, downloadSource] = await Promise.all([
          extension.options.getVideoSource(videoNodeSrc),
          extension.options.getVideoDownloadSource(videoNodeSrc),
        ]);
        setResolvedSrc(source);
        setResolvedDownloadSrc(downloadSource);
      } catch (error) {
        console.error("Error fetching video source:", error);
        setFailedToLoadVideo(true);
      }
    };

    void resolveVideoSources();
  }, [extension.options, videoNodeSrc]);

  useEffect(() => {
    const duplicateVideo = async () => {
      if (status !== ECustomVideoStatus.DUPLICATING || !extension.options.duplicateVideo || !videoNodeSrc) return;
      if (isDuplicating.current) return;

      isDuplicating.current = true;
      try {
        hasRetriedOnMount.current = true;
        const newAssetId = await extension.options.duplicateVideo(videoNodeSrc);
        if (!newAssetId) throw new Error("Duplication returned invalid asset ID");
        setFailedToLoadVideo(false);
        updateAttributes({ src: newAssetId, status: ECustomVideoStatus.UPLOADED });
      } catch (error) {
        console.error("Failed to duplicate video:", error);
        updateAttributes({ status: ECustomVideoStatus.DUPLICATION_FAILED });
      } finally {
        isDuplicating.current = false;
      }
    };

    void duplicateVideo();
  }, [extension.options, status, updateAttributes, videoNodeSrc]);

  useEffect(() => {
    if (hasVideoDuplicationFailed(status) && !hasRetriedOnMount.current && videoNodeSrc) {
      hasRetriedOnMount.current = true;
      updateAttributes({ status: ECustomVideoStatus.DUPLICATING });
    }
  }, [status, updateAttributes, videoNodeSrc]);

  useEffect(() => {
    if (status === ECustomVideoStatus.UPLOADED) {
      hasRetriedOnMount.current = false;
      setFailedToLoadVideo(false);
    }
  }, [status]);

  const hasDuplicationFailed = hasVideoDuplicationFailed(status);
  const shouldShowPlayer = resolvedSrc && !failedToLoadVideo && !hasDuplicationFailed;

  return (
    <NodeViewWrapper key={node.attrs[ECustomVideoAttributeNames.ID]}>
      <div className="mx-0 my-2 p-0" data-drag-handle>
        {shouldShowPlayer ? (
          <CustomVideoBlock
            {...props}
            downloadSrc={resolvedDownloadSrc}
            setFailedToLoadVideo={setFailedToLoadVideo}
            src={resolvedSrc}
          />
        ) : (
          <CustomVideoUploader
            {...props}
            failedToLoadVideo={failedToLoadVideo}
            hasDuplicationFailed={hasDuplicationFailed}
            maxFileSize={editor.storage.videoComponent?.maxFileSize ?? 0}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}
