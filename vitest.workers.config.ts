import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default mergeConfig(
  { ...base, test: { ...base.test, coverage: { enabled: false }, typecheck: { enabled: false } } },
  defineConfig({
    plugins: [
      cloudflareTest({
        miniflare: { compatibilityDate: "2026-01-01", compatibilityFlags: ["nodejs_compat"] },
      }),
    ],
    test: { exclude: ["tests/node.test.ts", "**/node_modules/**"] },
  }),
);
