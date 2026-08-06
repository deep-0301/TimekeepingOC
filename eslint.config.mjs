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
    // Vendored static assets, not source we author:
    "public/**",
    // Deno, not Next - different globals and import syntax entirely:
    "supabase/functions/**",
    // The built site, which Pages serves from this branch's root while it is
    // set to publish from a branch. Generated, minified, and not ours to fix.
    "_next/**",
    "*.html",
    "tesseract/**",
  ]),
]);

export default eslintConfig;
