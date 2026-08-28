/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { estimateCount } from "./estimates";

describe("estimateCount", () => {
  it("keeps only the minimum required estimate values", () => {
    expect(estimateCount.min).toBe(2);
    expect("max" in estimateCount).toBe(false);
  });
});
