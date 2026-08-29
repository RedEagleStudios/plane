import { describe, expect, it } from "vitest";
import { orderCompletedCycles, orderCyclesForGrouping } from "@plane/utils";

describe("orderCompletedCycles", () => {
  it("orders dated cycles by end date descending and places undated cycles last", () => {
    const cycles = [
      { name: "Sprint 83", start_date: "2025-12-29T00:00:01Z", end_date: "2026-01-04T23:59:00Z" },
      { name: "Undated", start_date: null, end_date: null },
      { name: "Sprint 117", start_date: "2026-08-22T00:00:01Z", end_date: "2026-08-28T23:59:00Z" },
      { name: "Sprint 116", start_date: "2026-08-15T00:00:01Z", end_date: "2026-08-21T23:59:00Z" },
    ];

    expect(orderCompletedCycles(cycles).map((cycle) => cycle.name)).toEqual([
      "Sprint 117",
      "Sprint 116",
      "Sprint 83",
      "Undated",
    ]);
    expect(cycles.map((cycle) => cycle.name)).toEqual(["Sprint 83", "Undated", "Sprint 117", "Sprint 116"]);
  });
});

describe("orderCyclesForGrouping", () => {
  it("preserves incomplete cycle order and sorts completed cycles by their end date", () => {
    const cycles = [
      {
        name: "Sprint 83",
        status: "completed" as const,
        start_date: "2025-12-29T00:00:01Z",
        end_date: "2026-01-04T23:59:00Z",
      },
      { name: "Current", status: "current" as const, start_date: "2026-08-29", end_date: "2026-09-05" },
      {
        name: "Sprint 117",
        status: "completed" as const,
        start_date: "2026-08-22T00:00:01Z",
        end_date: "2026-08-28T23:59:00Z",
      },
      { name: "Upcoming", status: "upcoming" as const, start_date: "2026-09-06", end_date: "2026-09-12" },
      {
        name: "Sprint 116",
        status: "completed" as const,
        start_date: "2026-08-15T00:00:01Z",
        end_date: "2026-08-21T23:59:00Z",
      },
    ];

    expect(orderCyclesForGrouping(cycles).map((cycle) => cycle.name)).toEqual([
      "Current",
      "Upcoming",
      "Sprint 117",
      "Sprint 116",
      "Sprint 83",
    ]);
    expect(cycles.map((cycle) => cycle.name)).toEqual(["Sprint 83", "Current", "Sprint 117", "Upcoming", "Sprint 116"]);
  });
});
