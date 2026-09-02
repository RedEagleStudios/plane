/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Download, ExternalLink } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// local imports
import { getVideoBlockId } from "../utils";
import type { CustomVideoNodeViewProps } from "./node-view";

type Props = CustomVideoNodeViewProps & {
  downloadSrc: string | undefined;
  setFailedToLoadVideo: (failed: boolean) => void;
  src: string;
};

export function CustomVideoBlock(props: Props) {
  const { downloadSrc, editor, node, selected, setFailedToLoadVideo, src } = props;

  return (
    <div
      id={getVideoBlockId(node.attrs.id ?? "")}
      className={cn("video-component group/video-component relative overflow-hidden rounded-md bg-black", {
        "ring-accent-primary ring-2": selected && editor.isEditable,
      })}
      contentEditable={false}
    >
      {/* Caption tracks require a second synchronized asset; uploaded videos may instead contain embedded captions. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        className="block max-h-[32rem] w-full bg-black"
        controls
        onCanPlay={() => setFailedToLoadVideo(false)}
        onError={() => setFailedToLoadVideo(true)}
        playsInline
        preload="metadata"
        src={src}
      >
        Your browser does not support embedded video playback.
      </video>
      <div className="pointer-events-none absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/video-component:opacity-100">
        <a
          className="pointer-events-auto grid size-7 place-items-center rounded bg-black/70 text-white/70 hover:text-white"
          href={downloadSrc ?? src}
          aria-label="Download video"
          download
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Download className="size-3.5" />
        </a>
        <a
          className="pointer-events-auto grid size-7 place-items-center rounded bg-black/70 text-white/70 hover:text-white"
          href={src}
          aria-label="Open video in new tab"
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
