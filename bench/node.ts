import { bench, run } from "mitata";
import { APPS, REQUESTS } from "./apps.ts";

for (const [name, path] of Object.entries(REQUESTS)) {
  for (const [framework, create] of Object.entries(APPS)) {
    const app = create();
    const url = `http://localhost${path}`;
    bench(`${name}|${framework}`, async () => {
      const response = await app.fetch(new Request(url));
      await response.arrayBuffer();
    });
  }
}

const { benchmarks } = await run({ format: "quiet" });
const average = new Map(benchmarks.map((trial) => [trial.alias, trial.runs[0]!.stats!.avg]));

console.log(`Node ${process.versions.node}, average time per request (lower is better)\n`);
console.log(`| Request | ${Object.keys(APPS).join(" | ")} |`);
console.log(`| --- |${" ---: |".repeat(Object.keys(APPS).length)}`);
for (const name of Object.keys(REQUESTS)) {
  const cells = Object.keys(APPS).map(
    (framework) => `${(average.get(`${name}|${framework}`)! / 1000).toFixed(2)} µs`,
  );
  console.log(`| ${name} | ${cells.join(" | ")} |`);
}
