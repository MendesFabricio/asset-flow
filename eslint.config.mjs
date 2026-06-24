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
  // Bloco de customização de regras para manter a qualidade estrita do código
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error", // Bloqueia novos overrides com 'any'
    },
  },
]);

export default eslintConfig;
