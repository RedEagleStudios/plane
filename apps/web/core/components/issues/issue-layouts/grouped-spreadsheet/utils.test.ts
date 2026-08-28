/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { formatEstimateTotal, groupedTableGroupTitle, sumNumericEstimateValues } from "./utils";

describe("Grouped Table summaries", () => {
  it("sums numeric estimates while ignoring unset and categorical values", () => {
    expect(sumNumericEstimateValues(["1", "9.5", 4, null, undefined, "", "XL"])).toBe(14.5);
    expect(sumNumericEstimateValues([null, undefined, "XL"])).toBeNull();
  });

  it("formats decimal totals without trailing zeroes", () => {
    expect(formatEstimateTotal(93)).toBe("93");
    expect(formatEstimateTotal(8.6)).toBe("8.6");
    expect(formatEstimateTotal(14.5)).toBe("14.5");
  });

  it("names unset cycle and module groups explicitly", () => {
    expect(groupedTableGroupTitle("cycle", "None", "None")).toBe("No Cycle");
    expect(groupedTableGroupTitle("module", "None", "None")).toBe("No Module");
    expect(groupedTableGroupTitle("state", "None", "None")).toBe("None");
    expect(groupedTableGroupTitle("cycle", "cycle-id", "Sprint 117")).toBe("Sprint 117");
  });
});
