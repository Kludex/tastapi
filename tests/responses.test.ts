import { Router } from "tastapi";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);

describe("responses", () => {
  test("a returned Response skips response validation", async () => {
    const app = new Router();
    app.get("/raw", { responseSchema: z.object({ id: z.number() }) }, () => new Response("raw"));

    const response = await app.fetch(request("/raw"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("raw");
  });
});
