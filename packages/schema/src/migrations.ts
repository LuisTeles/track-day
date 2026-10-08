import { CURRENT_SCHEMA_VERSION } from "./payloads";

type JsonObject = Record<string, unknown>;

/**
 * `migrations[n]` upgrades a payload from version `n` to `n + 1`. Add an entry
 * here whenever `CURRENT_SCHEMA_VERSION` is bumped.
 */
export const migrations: Record<number, (payload: JsonObject) => JsonObject> = {
  /** v2: `Guide.video` (reference onboard lap). Only backups hold full guides. */
  1: (payload) => {
    if (payload.kind !== "backup") return payload;
    const data = payload.data as JsonObject | undefined;
    if (typeof data !== "object" || data === null || !Array.isArray(data.guides)) return payload;
    const guides = data.guides.map((g: unknown) =>
      typeof g === "object" && g !== null && !("video" in g) ? { ...g, video: null } : g,
    );
    return { ...payload, data: { ...data, guides } };
  },
};

export class MigrationError extends Error {
  override name = "MigrationError";
}

/**
 * Brings any supported payload up to `CURRENT_SCHEMA_VERSION`. Validation is
 * the caller's job; this only reshapes data between versions.
 */
export function migrate(
  input: unknown,
  registry: Record<number, (payload: JsonObject) => JsonObject> = migrations,
  target: number = CURRENT_SCHEMA_VERSION,
): JsonObject {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new MigrationError("Payload must be a JSON object");
  }

  let payload = input as JsonObject;
  const version = payload.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new MigrationError("Payload is missing a valid schemaVersion");
  }
  if (version > target) {
    throw new MigrationError(
      `Payload schemaVersion ${version} is newer than this app supports (${target}). Update the app.`,
    );
  }

  for (let v = version; v < target; v++) {
    const step = registry[v];
    if (!step) throw new MigrationError(`No migration from schemaVersion ${v} to ${v + 1}`);
    payload = { ...step(payload), schemaVersion: v + 1 };
  }
  return payload;
}
