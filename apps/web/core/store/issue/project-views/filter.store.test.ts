import { afterEach, describe, expect, it, vi } from "vitest";
import { EIssueFilterType } from "@plane/constants";
import type { IProjectView, TWorkItemFilterExpression } from "@plane/types";
import { EIssueLayoutTypes, EViewAccess } from "@plane/types";
import type { IIssueRootStore } from "../root.store";
import { ProjectViewIssuesFilter } from "./filter.store";

const savedExpression: TWorkItemFilterExpression = { priority__in: "high" };
const localExpression: TWorkItemFilterExpression = { priority__in: "urgent" };

function createStore() {
  const savedView: IProjectView = {
    id: "view-id",
    access: EViewAccess.PUBLIC,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    is_favorite: false,
    created_by: "user-id",
    updated_by: "user-id",
    name: "Saved view",
    description: "",
    rich_filters: savedExpression,
    display_filters: { layout: EIssueLayoutTypes.SPREADSHEET, order_by: "-created_at" },
    display_properties: { priority: true },
    query: {},
    query_data: {},
    project: "project-id",
    workspace: "workspace-id",
    logo_props: undefined,
    is_locked: false,
    is_pinned: false,
    owned_by: "user-id",
  };
  const getViewById = vi.fn(() => savedView);
  const store = new ProjectViewIssuesFilter({
    rootStore: { projectView: { getViewById } },
    projectViewIssues: { fetchIssuesWithExistingPagination: vi.fn() },
  } as unknown as IIssueRootStore);
  const getViewDetails = vi.spyOn(store.issueFilterService, "getViewDetails").mockResolvedValue(savedView);
  return { store, savedView, getViewById, getViewDetails };
}

async function editFilters(store: ProjectViewIssuesFilter) {
  await store.updateFilterExpression("workspace", "project-id", "view-id", localExpression);
  await store.updateFilters(
    "workspace",
    "project-id",
    EIssueFilterType.DISPLAY_FILTERS,
    { order_by: "priority" },
    "view-id"
  );
  await store.updateFilters(
    "workspace",
    "project-id",
    EIssueFilterType.DISPLAY_PROPERTIES,
    { priority: false },
    "view-id"
  );
}

function expectLocalFilters(store: ProjectViewIssuesFilter) {
  expect(store.getAppliedFilters("view-id")).toMatchObject({
    filters: JSON.stringify(localExpression),
    order_by: "priority",
  });
  expect(store.getIssueFilters("view-id")?.displayProperties?.priority).toBe(false);
}

describe("ProjectViewIssuesFilter viewing session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps unsaved rich filters, sorting and display properties through repeated revalidation", async () => {
    const { store } = createStore();
    await store.fetchFilters("workspace", "project-id", "view-id");
    await editFilters(store);

    await store.fetchFilters("workspace", "project-id", "view-id");
    await store.fetchFilters("workspace", "project-id", "view-id");

    expectLocalFilters(store);
  });

  it("does not let a concurrent initialization response overwrite edits made after the first response", async () => {
    const { store, savedView, getViewDetails } = createStore();
    let resolvePending!: (view: IProjectView) => void;
    getViewDetails.mockImplementationOnce(
      () =>
        new Promise<IProjectView>((resolve) => {
          resolvePending = resolve;
        })
    );
    const pendingFetch = store.fetchFilters("workspace", "project-id", "view-id");
    await store.fetchFilters("workspace", "project-id", "view-id");
    await editFilters(store);

    resolvePending(savedView);
    await pendingFetch;

    expectLocalFilters(store);
  });

  it("keeps an explicit saved-view update when an older initialization request completes", async () => {
    const { store, savedView, getViewDetails } = createStore();
    let resolvePending!: (view: IProjectView) => void;
    getViewDetails.mockImplementationOnce(
      () =>
        new Promise<IProjectView>((resolve) => {
          resolvePending = resolve;
        })
    );
    const pendingFetch = store.fetchFilters("workspace", "project-id", "view-id");
    store.mutateFilters("workspace", "view-id", {
      ...savedView,
      rich_filters: localExpression,
      display_filters: { ...savedView.display_filters, order_by: "priority" },
      display_properties: { priority: false },
    });

    resolvePending(savedView);
    await pendingFetch;

    expectLocalFilters(store);
  });

  it("restores saved defaults on reset and starts a fresh page store without unsaved edits", async () => {
    const { store } = createStore();
    await store.fetchFilters("workspace", "project-id", "view-id");
    await editFilters(store);

    const reloaded = createStore().store;
    await reloaded.fetchFilters("workspace", "project-id", "view-id");
    expectLocalFilters(store);
    expect(reloaded.getAppliedFilters("view-id")).toMatchObject({
      filters: JSON.stringify(savedExpression),
      order_by: "-created_at",
    });

    store.resetFilters("workspace", "view-id");
    await store.fetchFilters("workspace", "project-id", "view-id");
    expect(store.getAppliedFilters("view-id")).toEqual(reloaded.getAppliedFilters("view-id"));
    expect(store.getIssueFilters("view-id")?.displayProperties?.priority).toBe(true);

    await editFilters(store);
    await store.fetchFilters("workspace", "project-id", "view-id");
    expectLocalFilters(store);
  });
});
