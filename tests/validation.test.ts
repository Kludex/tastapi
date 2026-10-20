import { Router } from "tastapi";
import { describe, expect, test } from "vitest";
import * as z from "zod";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);
const post = (body: BodyInit | null, contentType?: string) =>
  request("/items", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });

function itemsApp() {
  const app = new Router();
  app.post("/items", { body: z.object({ name: z.string() }) }, ({ body }) => body);
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
    expect(await response.json()).toEqual({ detail: "Unsupported Media Type" });
  });

  test("reports a missing body clearly", async () => {
    const response = await itemsApp().fetch(post(null));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      detail: [{ type: "missing", loc: ["body"], msg: "Request body is required" }],
    });
  });

  test("allows an empty body when the schema accepts undefined", async () => {
    const app = new Router();
    app.post("/items", { body: z.object({ name: z.string() }).optional() }, ({ body }) => ({
      empty: body === undefined,
    }));

    const response = await app.fetch(post(null));

    expect(await response.json()).toEqual({ empty: true });
  });

  test("reports invalid JSON", async () => {
    const response = await itemsApp().fetch(post("{", "application/json"));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      detail: [
        { type: "json_invalid", loc: ["body"], msg: expect.stringContaining("Invalid JSON") },
      ],
    });
  });
});

describe("body size", () => {
  test("defaults to 1 MiB", async () => {
    const name = "x".repeat(1024 * 1024);

    const response = await itemsApp().fetch(post(JSON.stringify({ name }), "application/json"));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ detail: "Request body too large" });
  });

  test("is configurable", async () => {
    const app = new Router({ maxBodySize: 11 });
    app.post("/items", { body: z.object({ name: z.string() }) }, ({ body }) => body);

    expect((await app.fetch(post('{"name":"a"}', "application/json"))).status).toBe(413);
    expect((await app.fetch(post('{"name":""}', "application/json"))).status).toBe(200);
  });

  test("rejects a declared content length over the limit before reading", async () => {
    const response = await itemsApp().fetch(
      request("/items", {
        method: "POST",
        body: '{"name": "pen"}',
        headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024) },
      }),
    );

    expect(response.status).toBe(413);
  });

  test("is enforced without a content length", async () => {
    const app = new Router({ maxBodySize: 10 });
    app.post("/items", { body: z.object({ name: z.string() }) }, ({ body }) => body);
    const chunks = ['{"name":', '"', "a".repeat(20), '"}'];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) {
          controller.close();
        } else {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      },
    });

    const response = await app.fetch(
      new Request("http://test/items", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
  });
});

describe("validation errors", () => {
  test("list every failing location", async () => {
    const app = new Router();
    app.post(
      "/users/{id}",
      {
        path: z.object({ id: z.coerce.number().int() }),
        query: z.object({ page: z.coerce.number() }),
        body: z.object({ tags: z.array(z.string()) }),
      },
      () => null,
    );

    const response = await app.fetch(
      request("/users/x?page=y", {
        method: "POST",
        body: '{"tags": [1]}',
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      detail: [
        { type: "invalid_type", loc: ["path", "id"], msg: expect.any(String) },
        { type: "invalid_type", loc: ["query", "page"], msg: expect.any(String) },
        { type: "invalid_type", loc: ["body", "tags", 0], msg: expect.any(String) },
      ],
    });
  });

  test("report invalid percent-encoding in the path", async () => {
    const app = new Router();
    app.get("/files/{name}", { path: z.object({ name: z.string() }) }, ({ path }) => path);

    const response = await app.fetch(request("/files/%E0%A4%A"));

    expect(await response.json()).toEqual({
      detail: [
        { type: "invalid_encoding", loc: ["path", "name"], msg: "Invalid percent-encoding" },
      ],
    });
  });
});

describe("cookies", () => {
  test("are parsed leniently", async () => {
    const app = new Router();
    app.get(
      "/",
      { cookies: z.object({ a: z.string(), b: z.string(), c: z.string() }) },
      ({ cookies }) => cookies,
    );

    const response = await app.fetch(
      request("/", { headers: { cookie: 'a="quoted"; flag; b=%E0%A4%A; a=second; c=x=y' } }),
    );

    expect(await response.json()).toEqual({ a: "quoted", b: "%E0%A4%A", c: "x=y" });
  });
});

describe("query", () => {
  test("keeps the last value for scalar fields", async () => {
    const app = new Router();
    app.get(
      "/",
      { query: z.object({ page: z.string(), extra: z.string().optional() }) },
      ({ query }) => query,
    );

    const response = await app.fetch(request("/?page=1&page=2&other=x"));

    expect(await response.json()).toEqual({ page: "2" });
  });

  test("collects every value for array fields behind wrappers", async () => {
    const app = new Router();
    app.get(
      "/",
      { query: z.object({ id: z.array(z.coerce.number()).optional().nullable() }) },
      ({ query }) => query,
    );

    const response = await app.fetch(request("/?id=1"));

    expect(await response.json()).toEqual({ id: [1] });
  });
});
