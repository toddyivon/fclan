import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Vendored harvest: src/lib/analysis/pro/* is verbatim third-party code
  // (GT7-Telemetry-Pro engines, see the provenance header in each file).
  // Kept byte-identical to the source so future diffs stay reviewable;
  // the `any`s are theirs, and the barrel/testsuite pins the public API.
  {
    files: ["src/lib/analysis/pro/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
]);

export default eslintConfig;
