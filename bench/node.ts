import { bench, group, run, summary } from "mitata";
import { APPS, REQUESTS } from "./apps.ts";

for (const [name, path] of Object.entries(REQUESTS)) {
  group(name, () => {
    summary(() => {
      for (const [framework, create] of Object.entries(APPS)) {
        const app = create();
        const url = `http://localhost${path}`;
        bench(framework, async () => {
          const response = await app.fetch(new Request(url));
          await response.arrayBuffer();
        });
      }
    });
  });
}

await run();
