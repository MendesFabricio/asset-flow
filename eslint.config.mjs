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
      // Warn on `any` so new ones are flagged but old ones don't block CI
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler rules — valid async patterns trigger false positives
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
      // Next.js specific rules
      "@next/next/no-img-element": "warn",
    },
  },
]);

export default eslintConfig;
