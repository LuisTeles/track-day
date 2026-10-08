"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-border bg-background p-1 text-sm shadow-xl",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const item =
  "flex h-10 cursor-default items-center gap-2 rounded-lg px-3 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-surface pointer-coarse:h-11 [&_svg]:size-4";

function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(item, className)} {...props} />;
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(item, "pl-9 relative", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-3">
        <Check aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

function DropdownMenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className="my-1 h-px bg-border" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn("px-3 py-1.5 text-xs font-medium text-muted", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
