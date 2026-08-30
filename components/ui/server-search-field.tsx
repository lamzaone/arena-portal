"use client";

import type { InputHTMLAttributes } from "react";
import { useEffect, useState } from "react";

import { SearchField } from "@/components/ui/search-field";

type ServerSearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> & {
  id: string;
  label: string;
  defaultValue?: string;
  helpText?: string;
  rootClassName?: string;
};

/**
 * URL-backed search field. It uses the same clear button, pending indicator,
 * keyboard behavior, and geometry as every client-filtered search.
 */
export function ServerSearchField({
  id,
  label,
  defaultValue = "",
  helpText,
  rootClassName,
  ...inputProps
}: ServerSearchFieldProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => setValue(defaultValue), [defaultValue]);

  return <SearchField {...inputProps} id={id} label={label} value={value} onValueChange={setValue} helpText={helpText} rootClassName={rootClassName} />;
}
