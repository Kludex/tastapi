import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  deps: { neverBundle: [/^node:/] },
});
