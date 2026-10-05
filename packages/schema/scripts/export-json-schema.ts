// Writes the import payload JSON Schemas to `json-schema/` for docs and tooling.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guideImportJsonSchema, trackImportJsonSchema } from "../src/json-schema";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "json-schema");
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of [
  ["track-import", trackImportJsonSchema()],
  ["guide-import", guideImportJsonSchema()],
] as const) {
  const file = join(outDir, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify(schema, null, 2) + "\n");
  console.log(`wrote ${file}`);
}
