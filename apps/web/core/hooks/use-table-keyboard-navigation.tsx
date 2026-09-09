/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const getAdjacentRow = (element: HTMLElement, direction: -1 | 1) => {
  const row = element.closest("tr");
  const table = row?.closest("table");
  if (!row || !table) return;

  // Measured grouped tables use one tbody per parent and its descendants.
  // Skip group headers and virtual padding, which have no focusable cells.
  for (let index = row.rowIndex + direction; index >= 0 && index < table.rows.length; index += direction) {
    const candidate = table.rows[index];
    if (candidate.querySelector("td[tabindex], th[tabindex]")) return candidate;
  }
};
export const useTableKeyboardNavigation = () => {
  const handleKeyBoardNavigation = function (e: React.KeyboardEvent<HTMLTableElement>) {
    const element = e.target as HTMLElement;

    if (!(element?.tagName === "TD" || element?.tagName === "TH")) return;

    let c: HTMLElement | null = null;
    if (e.key == "ArrowRight") {
      // Right Arrow
      c = element.nextSibling as HTMLElement;
    } else if (e.key == "ArrowLeft") {
      // Left Arrow
      c = element.previousSibling as HTMLElement;
    } else if (e.key == "ArrowUp") {
      // Up Arrow
      const index = Array.prototype.indexOf.call(element?.parentNode?.childNodes || [], element);
      const prevRow = getAdjacentRow(element, -1);

      c = prevRow?.childNodes?.[index] as HTMLElement;
    } else if (e.key == "ArrowDown") {
      // Down Arrow
      const index = Array.prototype.indexOf.call(element?.parentNode?.childNodes || [], element);
      const nextRow = getAdjacentRow(element, 1);

      c = nextRow?.childNodes[index] as HTMLElement;
    } else if (e.key == "Enter" || e.key == "Space") {
      e.preventDefault();
      (element?.querySelector(".clickable") as HTMLElement)?.click();
      return;
    }

    if (!c) return;

    e.preventDefault();
    c?.focus();
    c?.scrollIntoView({ behavior: "smooth", block: "center", inline: "end" });
  };

  return handleKeyBoardNavigation;
};
