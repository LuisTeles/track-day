"use client";

import {
  Keyboard,
  Layers,
  List,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Map as MapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRovingFocus } from "@/shared/hooks/use-roving-focus";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { IconButton } from "@/shared/ui/icon-button";
import { ToolButton } from "./track-view-shell";

export interface MapToolbarProps {
  hasMap: boolean; // false for NoOutline layouts: only Edit, car, Corners
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  chips: { on: boolean; disabled: boolean; toggle(): void };
  racingLine: { on: boolean; disabled: boolean; toggle(): void };
  editing: boolean;
  onToggleEdit(): void;
  carPicker: ReactNode; // the existing <select aria-label="Car">, now a <Select>
  listOpen: boolean;
  onToggleList(): void;
  redoMap: { available: boolean; active: boolean; open(): void };
  onShowShortcuts(): void;
}

const Divider = () => <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;

/** One row, never wrapping: secondary actions live in the two menus. */
export function MapToolbar(p: MapToolbarProps) {
  const { ref, onKeyDown } = useRovingFocus<HTMLDivElement>();
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Map controls"
      onKeyDown={onKeyDown}
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-background/90 p-1 shadow-lg backdrop-blur [scrollbar-width:none]"
    >
      {p.hasMap && (
        <>
          <IconButton label="Zoom in" onClick={p.onZoomIn}>
            <Plus />
          </IconButton>
          <IconButton label="Zoom out" onClick={p.onZoomOut}>
            <Minus />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Layers">
                <Layers />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuCheckboxItem
                checked={p.chips.on}
                disabled={p.chips.disabled}
                onCheckedChange={p.chips.toggle}
              >
                Speed &amp; gear
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={p.racingLine.on}
                disabled={p.racingLine.disabled}
                onCheckedChange={p.racingLine.toggle}
              >
                Racing line
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Divider />
        </>
      )}
      {p.carPicker}
      <ToolButton pressed={p.editing} onClick={p.onToggleEdit}>
        <Pencil aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Edit</span>
      </ToolButton>
      <ToolButton pressed={p.listOpen} onClick={p.onToggleList}>
        <List aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Corners</span>
      </ToolButton>
      {p.hasMap && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More map actions">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            <DropdownMenuItem onSelect={p.onReset}>
              <RotateCcw aria-hidden />
              Reset view
            </DropdownMenuItem>
            {p.redoMap.available && (
              <DropdownMenuItem onSelect={p.redoMap.open}>
                <MapIcon aria-hidden />
                Redo map
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={p.onShowShortcuts}>
              <Keyboard aria-hidden />
              Keyboard shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
