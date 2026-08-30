/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import type { TIssue } from "@plane/types";

export function getCreateMoreFormValues(submittedValues: Partial<TIssue>): Partial<TIssue> {
  const nextValues = {
    ...DEFAULT_WORK_ITEM_FORM_VALUES,
    ...submittedValues,
    name: "",
    description_html: "<p></p>",
  };

  delete nextValues.id;
  delete nextValues.sourceIssueId;

  return nextValues;
}
