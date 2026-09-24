/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { ALL_ISSUES } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { buildSubIssueVirtualRows } from "./virtual-rows";

describe("Sub-work item virtual hierarchy", () => {
  it("only exposes expanded descendants and restores their order after collapsing an ancestor", () => {
    const children: Record<string, string[]> = {
      root: ["parent", "sibling"],
      parent: ["child", "other-child"],
      child: ["grandchild"],
    };
    const expanded: Record<string, string[]> = { root: ["parent"], parent: ["child"] };
    const visibleIds = () =>
      buildSubIssueVirtualRows({
        groups: [{ group: { id: ALL_ISSUES, name: "All", payload: {} }, issueIds: children.root, isExpanded: true }],
        rootIssueId: "root",
        parentIssueId: "root",
        projectId: "project",
        spacingLeft: 6,
        issueServiceType: EIssueServiceType.ISSUES,
        getIssue: (id) => ({ project_id: "project", sub_issues_count: children[id]?.length ?? 0 }),
        getChildIds: (id) => children[id],
        getExpandedIssueIds: (id) => expanded[id] ?? [],
      }).flatMap((row) => (row.type === "issue" ? [row.issueId] : []));

    expect(visibleIds()).toEqual(["parent", "child", "grandchild", "other-child", "sibling"]);
    expanded.root = [];
    expect(visibleIds()).toEqual(["parent", "sibling"]);
    expanded.root = ["parent"];
    expect(visibleIds()).toEqual(["parent", "child", "grandchild", "other-child", "sibling"]);
  });

  it("keeps shared grouped branches independent and resolves epic descendants as ordinary work items", () => {
    const ordinaryIssues: Record<string, Pick<TIssue, "project_id" | "sub_issues_count">> = {
      child: { project_id: "nested-project", sub_issues_count: 0 },
    };
    const rows = buildSubIssueVirtualRows({
      groups: [
        { group: { id: "closed", name: "Closed group", payload: {} }, issueIds: ["parent"], isExpanded: false },
        { group: { id: "first", name: "First group", payload: {} }, issueIds: ["parent"], isExpanded: true },
        { group: { id: "second", name: "Second group", payload: {} }, issueIds: ["parent"], isExpanded: true },
      ],
      rootIssueId: "epic",
      parentIssueId: "epic",
      projectId: "epic-project",
      spacingLeft: 6,
      issueServiceType: EIssueServiceType.EPICS,
      getIssue: (id, serviceType) =>
        serviceType === EIssueServiceType.EPICS
          ? { project_id: "nested-project", sub_issues_count: 1 }
          : ordinaryIssues[id],
      getChildIds: (id) => (id === "parent" ? ["child"] : []),
      getExpandedIssueIds: (id) => (id === "epic" ? ["parent"] : []),
    });

    expect(rows.map((row) => (row.type === "group" ? row.group.name : row.issueId))).toEqual([
      "Closed group",
      "First group",
      "parent",
      "child",
      "Second group",
      "parent",
      "child",
    ]);
    const children = rows.flatMap((row) => (row.type === "issue" && row.issueId === "child" ? [row] : []));
    expect(children[0].key).not.toBe(children[1].key);
  });
});
