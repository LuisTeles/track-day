// Lint config for the workspace packages. apps/web has its own config that
// adds the Next.js rules.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/coverage/**", "apps/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
]);
