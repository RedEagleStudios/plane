/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTableKeyboardNavigation } from "./use-table-keyboard-navigation";

// Model separate table sections without a DOM dependency: the browser smoke
// check covers real focus and layout; these rows defend traversal across sections.
function createTable() {
  let focused = "";
  const table = { rows: [] as HTMLTableRowElement[] };
  function createRow(id: string, focusable = true) {
    const cells = [0, 1].map((column) => ({
      tagName: "TD",
      focus: () => {
        focused = `${id}:${column}`;
      },
      scrollIntoView: vi.fn(),
      closest: (selector: string) => (selector === "tr" ? row : undefined),
      get parentNode() {
        return row;
      },
    }));
    const row = {
      rowIndex: table.rows.length,
      childNodes: cells,
      closest: (selector: string) => (selector === "table" ? table : undefined),
      querySelector: () => (focusable ? cells[0] : null),
    } as unknown as HTMLTableRowElement;
    table.rows.push(row);
    return cells;
  }
  const header = createRow("header");
  createRow("padding", false);
  createRow("group", false);
  const parent = createRow("parent");
  const child = createRow("child");
  const nextParent = createRow("next-parent");
  const navigate = useTableKeyboardNavigation();
  const press = (target: unknown, key: string) => {
    navigate({ target, key, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLTableElement>);
    return focused;
  };
  return { header, parent, child, nextParent, press };
}

describe("Table keyboard navigation across measured sections", () => {
  it("moves between descendants and the next parent without losing the column", () => {
    const { child, nextParent, press } = createTable();
    expect(press(child[1], "ArrowDown")).toBe("next-parent:1");
    expect(press(nextParent[1], "ArrowUp")).toBe("child:1");
  });

  it("skips noninteractive group headers and virtual padding in both directions", () => {
    const { header, parent, press } = createTable();
    expect(press(header[0], "ArrowDown")).toBe("parent:0");
    expect(press(parent[0], "ArrowUp")).toBe("header:0");
  });
});
