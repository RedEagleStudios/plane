/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";

type Props = {
  label: string;
  width: number;
  minWidth: number;
  onResize: (width: number) => void;
};

export function ColumnResizeHandle({ label, width, minWidth, onResize }: Props) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);

  return (
    <hr
      aria-label={`Resize ${label} column`}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize; use left and right arrow keys when focused"
      className="absolute inset-y-0 right-0 z-20 m-0 h-full w-1.5 cursor-col-resize touch-none border-0 select-none hover:bg-accent-primary focus-visible:bg-accent-primary focus-visible:outline-none"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        onResize(Math.max(minWidth, Math.round(start.width + event.clientX - start.x)));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
        event.preventDefault();
        onResize(event.key === "Home" ? minWidth : Math.max(minWidth, width + (event.key === "ArrowRight" ? 16 : -16)));
      }}
    />
  );
}
