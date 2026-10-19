import { SimId } from "@track-day/schema";
import { useCallback, useSyncExternalStore } from "react";

// The car (and sim) you're driving, remembered for this browser only. It picks
// the guide a track opens with (ADR-004 fallback). A preference, never data:
// storage can be unavailable, so the value also lives in memory and every
// access is guarded.

export interface DrivingWith {
  carId: string;
  /** null = any sim. */
  sim: SimId | null;
}

const KEY = "driving-with";
const listeners = new Set<() => void>();
let memory: { raw: string | null; value: DrivingWith | null } | null = null;

function parse(raw: string | null): DrivingWith | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DrivingWith>;
    if (typeof v.carId !== "string") return null;
    const sim = SimId.safeParse(v.sim);
    return { carId: v.carId, sim: sim.success ? sim.data : null };
  } catch {
    return null;
  }
}

/** Same object while the stored text is unchanged, as useSyncExternalStore needs. */
function read(): DrivingWith | null {
  let raw: string | null = memory?.raw ?? null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // keep the in-memory value
  }
  if (memory && memory.raw === raw) return memory.value;
  memory = { raw, value: parse(raw) };
  return memory.value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing it.
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDrivingWith() {
  const value = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((next: DrivingWith | null) => {
    const raw = next ? JSON.stringify(next) : null;
    memory = { raw, value: next };
    try {
      if (raw) window.localStorage.setItem(KEY, raw);
      else window.localStorage.removeItem(KEY);
    } catch {
      // ignore: the in-memory value still applies for this session
    }
    listeners.forEach((l) => l());
  }, []);
  return [value, set] as const;
}
