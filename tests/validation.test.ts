import { Router } from "tastapi";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);
const post = (body: BodyInit | null, contentType?: string) =>
  request("/items", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });

function itemsApp() {
  const app = new Router();
  app.post("/items", { bodySchema: z.object({ name: z.string() }) }, ({ body }) => body);
  return app;
}

describe("body", () => {
  test.each([
    "application/json",
    "application/json; charset=utf-8",
    "application/merge-patch+json",
  ])("accepts %s", async (contentType) => {
    const response = await itemsApp().fetch(post('{"name": "pen"}', contentType));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "pen" });
  });

  test("accepts a body without a content type", async () => {
    const response = await itemsApp().fetch(post(new TextEncoder().encode('{"name": "pen"}')));

    expect(response.status).toBe(200);
  });

  test("rejects a non-JSON content type with 415", async () => {
    const response = await itemsApp().fetch(post("name=pen", "application/x-www-form-urlencoded"));

    expect(response.status).toBe(415);
  });

  test("reports a missing body clearly", async () => {
    const response = await itemsApp().fetch(post(null));

    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toContain("Request body is required");
  });

  test("allows an empty body when the schema accepts undefined", async () => {
    const app = new Router();
    app.post("/items", { bodySchema: z.object({ name: z.string() }).optional() }, ({ body }) => ({
      empty: body === undefined,
    }));

    const response = await app.fetch(post(null));

    expect(await response.json()).toEqual({ empty: true });
  });

  test("reports invalid JSON", async () => {
    const response = await itemsApp().fetch(post("{", "application/json"));

    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toContain("Invalid JSON");
  });
});
