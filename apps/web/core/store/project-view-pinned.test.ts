import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectViewStore } from "./project-view.store";

describe("ProjectViewStore.fetchPinnedViews", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not retry a failed request on each sidebar render", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = new ProjectViewStore({} as never);
    const getPinnedViews = vi.spyOn(store.viewService, "getPinnedViews").mockRejectedValue(new Error("Unavailable"));

    await store.fetchPinnedViews("minecraft", "project-id");
    await store.fetchPinnedViews("minecraft", "project-id");

    expect(getPinnedViews).toHaveBeenCalledTimes(1);
    expect(store.getPinnedViews("project-id")).toEqual([]);
  });
});
