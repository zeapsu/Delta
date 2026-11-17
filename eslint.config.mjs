import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Rules that used to be prose in AGENTS.md. A message says why.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "plaid/legacy",
              message: "Use the `plaid` SDK: legacy errors are Axios errors whose err.config carries the client id, secret and access token.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "navigator",
          property: "clipboard",
          message: "Delta is usually served over plain http, where navigator.clipboard is unavailable. Use copy() from app/ask-agent.tsx.",
        },
      ],
    },
  },
  {
    files: ["app/**", "lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "plaid/legacy",
              message: "Use the `plaid` SDK: legacy errors are Axios errors whose err.config carries the client id, secret and access token.",
            },
          ],
          patterns: [
            {
              group: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*"],
              message: "The MCP server is hand-rolled; the SDK is a dev dependency for the e2e client only.",
            },
          ],
        },
      ],
    },
  },
  {
    // The one place allowed to touch it, behind an isSecureContext check.
    files: ["app/ask-agent.tsx"],
    rules: { "no-restricted-properties": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (report bundles, traces).
    "e2e/.tmp/**",
    // Docusaurus doc site has its own toolchain.
    "website/**",
  ]),
]);

export default eslintConfig;
