import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^tastapi$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
      {
        find: /^tastapi\/node$/,
        replacement: fileURLToPath(new URL("./src/node.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    typecheck: { enabled: true, include: ["tests/**/*.test-d.ts"] },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
