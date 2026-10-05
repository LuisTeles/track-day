import type { z } from "zod";
import { parseLenientJson } from "./lenient-json";
import { migrate, MigrationError } from "./migrations";

export interface FieldIssue {
  /** e.g. `corners[3].direction`; empty for the root. */
  path: string;
  message: string;
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => (typeof key === "number" ? `[${key}]` : `${i === 0 ? "" : "."}${String(key)}`))
    .join("");
}

export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

export type ImportResult<T> =
  | { ok: true; value: T }
  | { ok: false; stage: "parse" | "version" | "validate"; issues: FieldIssue[] };

/**
 * Full import pipeline for pasted text: lenient JSON parse, then migration to
 * the current schema version, then validation against `schema`.
 */
export function parseImport<S extends z.ZodType>(raw: string, schema: S): ImportResult<z.infer<S>> {
  const parsed = parseLenientJson(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      stage: "parse",
      issues: [{ path: "", message: `Invalid JSON: ${parsed.error}` }],
    };
  }

  let migrated: unknown;
  try {
    migrated = migrate(parsed.value);
  } catch (e) {
    if (!(e instanceof MigrationError)) throw e;
    return { ok: false, stage: "version", issues: [{ path: "schemaVersion", message: e.message }] };
  }

  const result = schema.safeParse(migrated);
  if (!result.success) return { ok: false, stage: "validate", issues: toFieldIssues(result.error) };
  return { ok: true, value: result.data };
}
