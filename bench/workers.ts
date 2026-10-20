import autocannon from "autocannon";
import { Miniflare } from "miniflare";
import { rolldown } from "rolldown";
import { APPS, REQUESTS } from "./apps.ts";

const bundle = await rolldown({ input: new URL("worker.ts", import.meta.url).pathname });
const { output } = await bundle.generate({ format: "esm" });
const mf = new Miniflare({
  modules: true,
  script: output[0].code,
  compatibilityDate: "2026-01-01",
  port: 0,
});
const base = await mf.ready;

console.log("| Request | " + Object.keys(APPS).join(" | ") + " |");
console.log("| --- |" + " ---: |".repeat(Object.keys(APPS).length));
for (const [name, path] of Object.entries(REQUESTS)) {
  const cells: string[] = [];
  for (const framework of Object.keys(APPS)) {
    const url = new URL(`/${encodeURIComponent(framework)}${path}`, base).href;
    await autocannon({ url, duration: 1, connections: 32 });
    const result = await autocannon({ url, duration: 5, connections: 32 });
    cells.push(`${Math.round(result.requests.average).toLocaleString("en-US")} req/s`);
  }
  console.log(`| ${name} | ${cells.join(" | ")} |`);
}

await mf.dispose();
