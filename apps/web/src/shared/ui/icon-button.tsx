import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Button } from "./button";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "size" | "aria-label"> & {
  /** Accessible name and tooltip. Required: the button has no text. */
  label: string;
};

export function IconButton({ label, children, variant = "ghost", ...props }: IconButtonProps) {
  const icon = Children.map(children, (child) =>
    isValidElement(child)
      ? cloneElement(child as ReactElement<{ "aria-hidden"?: boolean }>, { "aria-hidden": true })
      : child,
  );
  return (
    <Button size="icon" variant={variant} aria-label={label} title={label} {...props}>
      {icon}
    </Button>
  );
}
