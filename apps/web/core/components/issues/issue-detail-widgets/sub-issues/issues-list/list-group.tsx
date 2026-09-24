/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CircleDashed } from "lucide-react";
import { ChevronRightIcon } from "@plane/propel/icons";
import type { IGroupByColumn } from "@plane/types";
import { cn } from "@plane/utils";

type TSubIssuesListGroupProps = {
  group: IGroupByColumn;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
};

export function SubIssuesListGroup({ group, count, isExpanded, onToggle }: TSubIssuesListGroupProps) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-2 p-3 text-left"
      aria-expanded={isExpanded}
      onClick={onToggle}
    >
      <ChevronRightIcon
        className={cn("size-3.5 text-placeholder transition-all", { "rotate-90": isExpanded })}
        strokeWidth={2.5}
      />
      <div className="grid flex-shrink-0 place-items-center overflow-hidden">
        {group.icon ?? <CircleDashed className="size-3.5" strokeWidth={2} />}
      </div>
      <span className="text-13 font-medium text-primary">{group.name}</span>
      <span className="text-13 text-placeholder">{count}</span>
    </button>
  );
}
