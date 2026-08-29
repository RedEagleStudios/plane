/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import type { Placement } from "@popperjs/core";
import { usePopper } from "react-popper";
// headless ui
import { Popover, Transition } from "@headlessui/react";
// ui
import { getButtonStyling } from "@plane/propel/button";

type Props = {
  children: React.ReactNode;
  icon?: React.ReactElement;
  miniIcon?: React.ReactNode;
  title?: string;
  placement?: Placement;
  disabled?: boolean;
  tabIndex?: number;
  menuButton?: React.ReactNode;
  isFiltersApplied?: boolean;
};

export function FiltersDropdown(props: Props) {
  const {
    children,
    miniIcon,
    icon,
    title = "Dropdown",
    placement,
    disabled = false,
    tabIndex,
    menuButton,
    isFiltersApplied = false,
  } = props;

  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "auto",
  });

  return (
    <Popover as="div">
      {({ open }) => (
        <>
          {menuButton ? (
            <Popover.Button
              type="button"
              ref={setReferenceElement}
              className="flex items-center border-0 bg-transparent p-0"
            >
              {menuButton}
            </Popover.Button>
          ) : (
            <Popover.Button
              type="button"
              ref={setReferenceElement}
              disabled={disabled}
              tabIndex={tabIndex}
              className={`${getButtonStyling("secondary", "lg")} relative`}
            >
              <span className="hidden items-center gap-1 @4xl:flex">
                {icon}
                <span className={open ? "text-primary" : "text-secondary"}>{title}</span>
              </span>
              <span className="flex @4xl:hidden">{miniIcon || title}</span>
              {isFiltersApplied && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-primary" />
              )}
            </Popover.Button>
          )}
          {typeof document !== "undefined" &&
            createPortal(
              <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <Popover.Panel
                  className="z-40 translate-y-0"
                  ref={setPopperElement}
                  style={styles.popper}
                  {...attributes.popper}
                >
                  <div className="my-1 overflow-hidden rounded-sm border border-subtle bg-surface-1 shadow-raised-100">
                    <div className="flex max-h-[30rem] w-[18.75rem] flex-col overflow-hidden lg:max-h-[37.5rem]">
                      {children}
                    </div>
                  </div>
                </Popover.Panel>
              </Transition>,
              document.body
            )}
        </>
      )}
    </Popover>
  );
}
