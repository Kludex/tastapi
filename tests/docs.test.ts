import { describe, expect, test, vi } from "vitest";
import * as errors from "../docs/examples/errors.ts";
import * as lifespan from "../docs/examples/lifespan.ts";
import * as middleware from "../docs/examples/middleware.ts";
import * as openapi from "../docs/examples/openapi.ts";
import * as pathParameters from "../docs/examples/path_parameters.ts";
import * as quickstart from "../docs/examples/quickstart.ts";
import * as responses from "../docs/examples/responses.ts";
import * as routing from "../docs/examples/routing.ts";
import * as validation from "../docs/examples/validation.ts";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);

async function call(
  app: { fetch: (request: Request) => Promise<Response> },
  path: string,
  init?: RequestInit,
) {
  const response = await app.fetch(request(path, init));
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  return { status: response.status, headers: response.headers, body };
}

describe("quickstart", () => {
  test("gets a user", async () => {
    expect(await call(quickstart.default, "/users/1")).toMatchObject({
      status: 200,
      body: { id: 1, name: "Ada" },
    });
  });
});

describe("routing", () => {
  const { app } = routing;

  test("serves every route", async () => {
    expect((await call(app, "/")).body).toEqual({ message: "Hello, world!" });
    expect((await call(app, "/items")).body).toEqual([{ id: 1 }]);
    expect(await call(app, "/items", { method: "POST" })).toMatchObject({
      status: 201,
      body: { id: 2 },
    });
    expect((await call(app, "/items/7")).body).toEqual({ id: "7" });
    expect((await call(app, "/items/7", { method: "DELETE" })).body).toBeNull();
    expect((await call(app, "/settings", { method: "PATCH" })).body).toEqual({ saved: true });
    expect((await call(app, "/proxy/a/b", { method: "POST" })).body).toEqual({
      method: "POST",
      rest: "a/b",
    });
  });

  test("answers 405 and OPTIONS", async () => {
    const response = await call(app, "/settings");

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("PUT, PATCH, OPTIONS");
    expect((await call(app, "/items", { method: "OPTIONS" })).headers.get("allow")).toBe(
      "GET, POST, HEAD, OPTIONS",
    );
  });
});

describe("path parameters", () => {
  const { app } = pathParameters;

  test("match convertors", async () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";

    expect((await call(app, "/files/a%20b")).body).toEqual({ name: "a b" });
    expect((await call(app, "/users/3")).body).toEqual({ id: 3 });
    expect((await call(app, "/users/abc")).status).toBe(404);
    expect((await call(app, "/users/0")).status).toBe(422);
    expect((await call(app, `/orders/${uuid}`)).body).toEqual({ orderId: uuid });
    expect((await call(app, "/orders/123")).status).toBe(404);
    expect((await call(app, "/static/css/site.css")).body).toEqual({ file: "css/site.css" });
    expect((await call(app, "/tags/abc")).body).toEqual({ tag: "abc" });
    expect((await call(app, "/tags/ABC")).status).toBe(404);
  });
});

describe("validation", () => {
  const { app } = validation;

  test("query", async () => {
    expect((await call(app, "/search?q=pen&tag=a&tag=b")).body).toEqual({
      q: "pen",
      page: 1,
      tags: ["a", "b"],
    });
    expect((await call(app, "/search?q=pen&tag=a&page=2")).body).toEqual({
      q: "pen",
      page: 2,
      tags: ["a"],
    });
    expect(await call(app, "/search")).toMatchObject({
      status: 422,
      body: { detail: [{ type: "invalid_type", loc: ["query", "q"] }] },
    });
  });

  test("body, headers and cookies", async () => {
    const response = await call(app, "/items", {
      method: "POST",
      body: JSON.stringify({ name: "pen", price: 2 }),
      headers: {
        "content-type": "application/json",
        "X-Request-ID": "abc",
        cookie: "theme=dark; session=s%201",
      },
    });

    expect(response).toMatchObject({
      status: 201,
      body: { name: "pen", price: 2, requestId: "abc", session: "s 1" },
    });
  });

  test("missing cookie", async () => {
    const response = await call(app, "/items", {
      method: "POST",
      body: JSON.stringify({ name: "pen", price: 2 }),
      headers: { "content-type": "application/json" },
    });

    expect(response).toMatchObject({
      status: 422,
      body: { detail: [{ loc: ["cookies", "session"] }] },
    });
  });
});

describe("responses", () => {
  const { app } = responses;

  test("filter output through the response schema", async () => {
    expect((await call(app, "/me")).body).toEqual({ id: 1, name: "Ada" });
  });

  test("respond with a declared status", async () => {
    expect((await call(app, "/users/1")).body).toEqual({ id: 1, name: "Ada" });
    expect(await call(app, "/users/2")).toMatchObject({
      status: 404,
      body: { detail: "User not found" },
    });

    const created = await call(app, "/users", {
      method: "POST",
      body: JSON.stringify({ name: "Grace" }),
      headers: { "content-type": "application/json" },
    });

    expect(created).toMatchObject({ status: 201, body: { id: 2, name: "Grace" } });
    expect(created.headers.get("location")).toBe("/users/2");
  });

  test("helpers", async () => {
    const hello = await call(app, "/hello.txt");
    expect(hello.body).toBe("Hello, world!");
    expect(hello.headers.get("content-type")).toBe("text/plain; charset=utf-8");

    const page = await call(app, "/hello.html");
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");

    const old = await call(app, "/old");
    expect(old.status).toBe(307);
    expect(old.headers.get("location")).toBe("/new");

    const data = await call(app, "/data.json");
    expect(data.body).toEqual({ pretty: true });
    expect(data.headers.get("cache-control")).toBe("no-store");

    const events = await call(app, "/events");
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    expect(events.body).toBe("data: one\n\ndata: two\n\n");
  });
});

describe("middleware", () => {
  const env = { API_TOKEN: "secret" };
  const fetch = (path: string, init?: RequestInit) =>
    middleware.default.fetch(request(path, init), env);

  test("rejects requests without the token", async () => {
    const response = await fetch("/admin/me");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ detail: "Not authenticated" });
  });

  test("passes the user to the handler", async () => {
    const response = await fetch("/admin/me", { headers: { authorization: "Bearer secret" } });

    expect(await response.json()).toEqual({ name: "Ada" });
    expect(response.headers.get("x-user")).toBe("Ada");
  });

  test("only runs on the routes it wraps", async () => {
    expect((await fetch("/health")).status).toBe(200);
    expect((await fetch("/admin/nope")).status).toBe(404);
  });
});

describe("errors", () => {
  const { app } = errors;

  test("ResponseError", async () => {
    expect(await call(app, "/items/101")).toMatchObject({
      status: 404,
      body: { detail: "Item not found" },
    });
    expect((await call(app, "/items/1")).body).toEqual({ id: 1 });

    const teapot = await call(app, "/teapot");
    expect(teapot).toMatchObject({ status: 418, body: { detail: { reason: "I'm a teapot" } } });
    expect(teapot.headers.get("x-brew")).toBe("tea");
  });

  test("onError", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    app.get("/boom", () => {
      throw new Error("boom");
    });

    expect((await call(app, "/boom")).status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Unhandled error", new Error("boom"));
    consoleError.mockRestore();
  });
});

describe("openapi", () => {
  test("serves the document and Swagger UI", async () => {
    const { app } = openapi;

    expect((await call(app, "/openapi.json")).body).toEqual(app.openApiDocument());
    expect((await call(app, "/docs")).body).toContain("swagger-ui");
  });
});

describe("lifespan", () => {
  test("state is built once and passed to fetch", async () => {
    const response = await lifespan.default.fetch(request("/users"));

    expect(await response.json()).toEqual([{ id: 1, name: "Ada" }]);
  });
});
