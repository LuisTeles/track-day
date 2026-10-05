// Remembers the last guide and corner practiced on each layout, so opening
// practice mode again picks up where you left off. A preference only: any
// storage failure just means starting from the beginning.

interface LastSession {
  guide: string | null;
  corner: number | null;
}

const key = (layoutId: string) => `practice:last:${layoutId}`;

export function readLastSession(layoutId: string | null): LastSession | null {
  if (!layoutId) return null;
  try {
    const raw = window.localStorage.getItem(key(layoutId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LastSession>;
    return {
      guide: typeof value.guide === "string" ? value.guide : null,
      corner: typeof value.corner === "number" ? value.corner : null,
    };
  } catch {
    return null;
  }
}

export function writeLastSession(layoutId: string, session: LastSession) {
  try {
    window.localStorage.setItem(key(layoutId), JSON.stringify(session));
  } catch {
    // ignore
  }
}
