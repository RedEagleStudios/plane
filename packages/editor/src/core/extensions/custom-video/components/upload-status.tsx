/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  editor: Editor;
  nodeId: string;
};

export function VideoUploadStatus(props: Props) {
  const { editor, nodeId } = props;
  const [displayStatus, setDisplayStatus] = useState(0);
  const displayStatusRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const uploadStatus = useEditorState({
    editor,
    selector: ({ editor: currentEditor }): number | undefined =>
      currentEditor.storage.utility?.assetsUploadStatus?.[nodeId],
  });

  useEffect(() => {
    if (uploadStatus === undefined) return;

    const start = displayStatusRef.current;
    const end = uploadStatus;
    const startTime = performance.now();
    const duration = 200;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const currentValue = Math.floor(start + (end - start) * easedProgress);

      displayStatusRef.current = currentValue;
      setDisplayStatus(currentValue);
      if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [uploadStatus]);

  if (uploadStatus === undefined) return null;

  return (
    <div
      className="absolute top-1 right-1 z-20 w-10 rounded-sm bg-black/60 text-center text-11 font-medium text-white"
      role="progressbar"
      aria-label="Video upload progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={displayStatus}
    >
      {displayStatus}%
    </div>
  );
}
