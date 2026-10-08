"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;
interface ConfirmApi {
  ask: Ask;
  /** Answers no to `question` if it is still the open one. */
  dismiss(question: Promise<boolean>): void;
}
const ConfirmContext = createContext<ConfirmApi | null>(null);

/** Promise-based stand-in for the browser’s confirm(), styled like the app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(undefined);
  const question = useRef<Promise<boolean>>(undefined);
  // There's no trigger element for Radix to return focus to, so remember it.
  const returnFocus = useRef<Element | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    question.current = undefined;
    setOptions(null);
  }, []);

  const api = useMemo<ConfirmApi>(
    () => ({
      ask: (next) => {
        // A second ask answers no to the first and keeps its focus target.
        if (resolver.current) resolver.current(false);
        else returnFocus.current = document.activeElement;
        setOptions(next);
        question.current = new Promise<boolean>((resolve) => (resolver.current = resolve));
        return question.current;
      },
      dismiss: (q) => {
        if (q === question.current) settle(false);
      },
    }),
    [settle],
  );

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        {options && (
          <AlertDialogContent
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const target = returnFocus.current;
              returnFocus.current = null;
              if (target instanceof HTMLElement && target.isConnected) target.focus();
            }}
          >
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="outline" autoFocus>
                  {options.cancelLabel ?? "Cancel"}
                </Button>
              </AlertDialogCancel>
              <Button
                variant={options.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * `await confirm({...})` resolves true on the confirm button, false on cancel,
 * Escape, or when the calling component unmounts first (say the browser's Back
 * button left the page), so a stale "yes" can never act on a page that's gone.
 */
export function useConfirm(): Ask {
  const api = useContext(ConfirmContext);
  if (!api) throw new Error("useConfirm needs a ConfirmProvider");
  const [mine] = useState(() => new Set<Promise<boolean>>());
  useEffect(
    () => () => {
      for (const q of mine) api.dismiss(q);
      mine.clear();
    },
    [api, mine],
  );
  return useCallback(
    (options) => {
      const q = api.ask(options);
      mine.add(q);
      void q.finally(() => mine.delete(q));
      return q;
    },
    [api, mine],
  );
}
