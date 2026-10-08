"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Tone = "default" | "success" | "danger";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{ show(message: string, tone?: Tone): void } | null>(null);
const DURATION = 4000;

/**
 * One message at a time in a polite live region that is always mounted (so
 * screen readers announce it). Bottom-center, above the safe area.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string, tone: Tone = "default") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-safe-4"
      >
        {toast && (
          <p
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-lg",
              toast.tone === "danger" && "border-danger/40",
            )}
          >
            {toast.tone === "success" && (
              <CheckCircle2 aria-hidden className="size-4 text-success" />
            )}
            {toast.tone === "danger" && <AlertCircle aria-hidden className="size-4 text-danger" />}
            {toast.message}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast needs a ToastProvider");
  return ctx;
}
