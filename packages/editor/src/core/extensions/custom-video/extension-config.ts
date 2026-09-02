/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import type {
  CustomVideoExtensionOptions,
  CustomVideoExtensionStorage,
  CustomVideoExtensionType,
  InsertVideoComponentProps,
  TCustomVideoAttributes,
} from "./types";
import { ECustomVideoAttributeNames } from "./types";
import { DEFAULT_CUSTOM_VIDEO_ATTRIBUTES } from "./utils";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.CUSTOM_VIDEO]: {
      insertVideoComponent: ({ file, pos, event }: InsertVideoComponentProps) => ReturnType;
    };
  }
  interface Storage {
    [CORE_EXTENSIONS.CUSTOM_VIDEO]: CustomVideoExtensionStorage;
  }
}

export const CustomVideoExtensionConfig: CustomVideoExtensionType = Node.create<
  CustomVideoExtensionOptions,
  CustomVideoExtensionStorage
>({
  name: CORE_EXTENSIONS.CUSTOM_VIDEO,
  group: "block",
  atom: true,

  addAttributes() {
    return Object.values(ECustomVideoAttributeNames).reduce(
      (attributes, attributeName) => {
        attributes[attributeName] = {
          default: DEFAULT_CUSTOM_VIDEO_ATTRIBUTES[attributeName],
        };
        return attributes;
      },
      {} as Record<ECustomVideoAttributeNames, { default: TCustomVideoAttributes[ECustomVideoAttributeNames] }>
    );
  },

  parseHTML() {
    return [{ tag: "video-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video-component", mergeAttributes(HTMLAttributes)];
  },
});
