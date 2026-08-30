/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueDisplayProperties, TIssue } from "@plane/types";

export function getRepeatedQuickAddValues(values: Partial<TIssue>): Partial<TIssue> {
  return {
    ...values,
    name: "",
    description_html: "<p></p>",
  };
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
