/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { ICycle, TCycleGroups, TFilterProperty, TSupportedOperators } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

const CURRENT_CYCLE_FILTER_VALUE = "current";

type TCycleFilterOption = {
  id: string;
  name: string;
  status: TCycleGroups;
};

/**
 * Cycle filter specific params
 */
export type TCreateCycleFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<TCycleGroups> & {
    cycles: ICycle[];
  };

/**
 * Helper to get the cycle multi select config
 * @param params - The filter params
 * @returns The cycle multi select config
 */
export const getCycleMultiSelectConfig = (
  params: TCreateCycleFilterParams,
  singleValueOperator: TSupportedOperators
) => {
  const cycleOptions: TCycleFilterOption[] = [
    {
      id: CURRENT_CYCLE_FILTER_VALUE,
      name: "Current cycle",
      status: "current",
    },
    ...params.cycles.map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      status: cycle.status || "draft",
    })),
  ];

  return getMultiSelectConfig<TCycleFilterOption, string, TCycleGroups>(
    {
      items: cycleOptions,
      getId: (cycle) => cycle.id,
      getLabel: (cycle) => cycle.name,
      getValue: (cycle) => cycle.id,
      getIconData: (cycle) => cycle.status,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      ...params,
    }
  );
};

/**
 * Get the cycle filter config
 * @template K - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the cycle filter config
 */
export const getCycleFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateCycleFilterParams> =>
  (params: TCreateCycleFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Cycle",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getCycleMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
        ),
      ]),
    });
