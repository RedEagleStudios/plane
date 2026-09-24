/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export function useSubIssueVirtualizer(rows: readonly { key: string }[]) {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Detail pages and the different peek modes have different scrolling ancestors.
  useLayoutEffect(() => {
    let ancestor = listRef.current?.parentElement ?? null;
    while (ancestor && !/(auto|scroll|overlay)/.test(getComputedStyle(ancestor).overflowY)) {
      ancestor = ancestor.parentElement;
    }
    scrollElementRef.current = ancestor;
    return () => {
      scrollElementRef.current = null;
    };
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => rows[index].key,
    overscan: 5,
    scrollMargin,
  });

  useLayoutEffect(() => {
    const list = listRef.current;
    const scrollElement = scrollElementRef.current;
    if (!list || !scrollElement) return;

    let width = list.clientWidth;
    const updateLayout = () => {
      setScrollMargin(
        list.getBoundingClientRect().top -
          scrollElement.getBoundingClientRect().top +
          scrollElement.scrollTop -
          scrollElement.clientTop
      );
      if (width !== list.clientWidth) {
        width = list.clientWidth;
        virtualizer.measure();
        list.querySelectorAll<HTMLElement>("[data-index]").forEach(virtualizer.measureElement);
      }
    };
    updateLayout();

    const resizeObserver = new ResizeObserver(updateLayout);
    // Content above the list can resize without resizing a fixed-height scroller.
    // Observe its siblings along the ancestor chain as well as the list itself.
    let element: HTMLElement | null = list;
    while (element) {
      resizeObserver.observe(element);
      if (element === scrollElement) break;
      let sibling = element.previousElementSibling;
      while (sibling) {
        resizeObserver.observe(sibling);
        sibling = sibling.previousElementSibling;
      }
      element = element.parentElement;
    }
    scrollElement.addEventListener("scroll", updateLayout, { passive: true });
    window.addEventListener("resize", updateLayout);
    return () => {
      resizeObserver.disconnect();
      scrollElement.removeEventListener("scroll", updateLayout);
      window.removeEventListener("resize", updateLayout);
    };
  }, [virtualizer]);

  return { listRef, virtualizer, scrollMargin };
}
