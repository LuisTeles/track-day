import { shortPadName, type Bindings, type ButtonBinding, type NavAction } from "./gamepad";

const KEY = "practice:wheel-buttons";
const EMPTY: Bindings = { next: null, prev: null };

const isBinding = (v: unknown): v is ButtonBinding =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as ButtonBinding).gamepadId === "string" &&
  Number.isInteger((v as ButtonBinding).button);

export function readBindings(): Bindings {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Bindings> | null;
    return {
      next: isBinding(raw?.next) ? raw.next : null,
      prev: isBinding(raw?.prev) ? raw.prev : null,
    };
  } catch {
    return EMPTY;
  }
}

export function writeBindings(bindings: Bindings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(bindings));
  } catch {
    // ignore: bindings last for this session
  }
}

const describe = (b: ButtonBinding | null) =>
  b ? `${shortPadName(b.gamepadId)} · button ${b.button + 1}` : "Not set";

/** Settings block: bind a wheel/gamepad button to next and previous. Experimental (ADR-006). */
export function WheelButtonSettings({
  bindings,
  capturing,
  onCapture,
  onCancel,
  onClear,
}: {
  bindings: Bindings;
  capturing: NavAction | null;
  onCapture(action: NavAction): void;
  onCancel(): void;
  onClear(): void;
}) {
  return (
    <section
      className="w-full space-y-1 border-t border-border px-3 pt-2"
      data-testid="wheel-buttons"
    >
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
        Wheel button · experimental
      </h3>
      {capturing ? (
        <p role="status" className="text-sm">
          Press the button for{" "}
          <strong>{capturing === "next" ? "next corner" : "previous corner"}</strong>…{" "}
          <button type="button" className="underline" onClick={onCancel}>
            Cancel
          </button>
        </p>
      ) : (
        <>
          {(["next", "prev"] as const).map((action) => (
            <div key={action} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {action === "next" ? "Next" : "Previous"}:{" "}
                <span className="text-muted">{describe(bindings[action])}</span>
              </span>
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-0.5 hover:bg-background"
                onClick={() => onCapture(action)}
              >
                Set
              </button>
            </div>
          ))}
          {(bindings.next || bindings.prev) && (
            <button type="button" className="text-sm text-muted underline" onClick={onClear}>
              Clear buttons
            </button>
          )}
          <p className="text-xs text-muted">
            Works when the wheel is connected to this device (e.g. a second monitor on the sim PC).
          </p>
        </>
      )}
    </section>
  );
}
