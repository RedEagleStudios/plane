/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Placement } from "@popperjs/core";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
export const QUICK_ADD_DROPDOWN_PLACEMENT: Placement = "top-start";

export function getRepeatedQuickAddValues(values: Partial<TIssue>): Partial<TIssue> {
  return {
    ...values,
    name: "",
    description_html: "<p></p>",
  };
}

export function plainTextToDescriptionHtml(value: string): string {
  if (value.trim().length === 0) return "<p></p>";

  return value
    .split("\n")
    .map((line) => {
      const escapedLine = line
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
      return escapedLine.length > 0 ? `<p>${escapedLine}</p>` : "<p><br></p>";
    })
    .join("");
}

export function isQuickAddEditableProperty(property: keyof IIssueDisplayProperties): boolean {
  switch (property) {
    case "state":
    case "priority":
    case "assignee":
    case "labels":
    case "modules":
    case "cycle":
    case "start_date":
    case "due_date":
    case "estimate":
      return true;
    default:
      return false;
  }
}
