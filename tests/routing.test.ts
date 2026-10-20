import { Router } from "tastapi";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);

describe("routing", () => {
  test("plain route", async () => {
    const app = new Router();
    app.get("/hello", {}, () => ({ message: "Hello" }));

    const response = await app.fetch(request("/hello"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello" });
  });

  test("path parameters", async () => {
    const app = new Router();
    app.get("/users/{id:int}", { path: z.object({ id: z.coerce.number() }) }, ({ path }) => ({
      id: path.id,
    }));

    const response = await app.fetch(request("/users/42"));

    expect(await response.json()).toEqual({ id: 42 });
    expect((await app.fetch(request("/users/abc"))).status).toBe(404);
  });

  test("not found", async () => {
    const app = new Router();
    app.get("/hello", {}, () => "hi");

    const response = await app.fetch(request("/nope"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Not Found" });
  });

  test("method not allowed", async () => {
    const app = new Router();
    app.get("/hello", {}, () => "hi");

    const response = await app.fetch(request("/hello", { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(await response.json()).toEqual({ detail: "Method Not Allowed" });
  });

  test("sub-router", async () => {
    const users = new Router();
    users.get("/me", {}, () => ({ name: "Ada" }));
    const app = new Router();
    app.includeRouter("/users", users);

    const response = await app.fetch(request("/users/me"));

    expect(await response.json()).toEqual({ name: "Ada" });
  });

  test("state reaches the handler", async () => {
    const app = new Router<{ user: string }>();
    app.get("/me", {}, ({ state }) => ({ user: state.user }));

    const response = await app.fetch(request("/me"), { user: "Ada" });

    expect(await response.json()).toEqual({ user: "Ada" });
  });

  test("sub-router prefix matches on a segment boundary", async () => {
    const user = new Router();
    user.get("", {}, () => "user");
    user.get("/{rest:path}", { path: z.object({ rest: z.string() }) }, () => "user rest");
    const app = new Router();
    app.includeRouter("/api/user", user);
    app.get("/api/users", {}, () => "users");

    expect(await (await app.fetch(request("/api/users"))).json()).toBe("users");
    expect(await (await app.fetch(request("/api/user"))).json()).toBe("user");
    expect(await (await app.fetch(request("/api/user/1"))).json()).toBe("user rest");
  });

  test("not-found inside a sub-router falls through to later routes", async () => {
    const api = new Router();
    api.get("/x", {}, () => "x");
    const app = new Router();
    app.includeRouter("/api", api);
    app.get("/api/y", {}, () => "y");
    app.post("/api/x", {}, () => "post x");

    expect(await (await app.fetch(request("/api/y"))).json()).toBe("y");
    expect(await (await app.fetch(request("/api/x", { method: "POST" }))).json()).toBe("post x");
    const response = await app.fetch(request("/api/x", { method: "PUT" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, HEAD, OPTIONS");
  });

  test.each(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const)(
    "%s helper",
    async (method) => {
      const app = new Router();
      const helper = method.toLowerCase() as Lowercase<typeof method>;
      app[helper]("/thing", {}, () => new Response(null, { status: 204, headers: { method } }));

      const response = await app.fetch(request("/thing", { method }));

      expect(response.status).toBe(204);
      expect(response.headers.get("method")).toBe(method);
    },
  );

  test("HEAD runs the GET route without sending the body", async () => {
    const app = new Router();
    app.get("/thing", {}, () => ({ big: "body" }));

    const response = await app.fetch(request("/thing", { method: "HEAD" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe("");
  });

  test("an explicit HEAD route wins over GET", async () => {
    const app = new Router();
    app.get("/thing", {}, () => "get");
    app.head("/thing", {}, () => new Response(null, { headers: { route: "head" } }));

    const response = await app.fetch(request("/thing", { method: "HEAD" }));

    expect(response.headers.get("route")).toBe("head");
  });

  test("OPTIONS lists the allowed methods", async () => {
    const app = new Router();
    app.get("/thing", {}, () => "get");
    app.post("/thing", {}, () => "post");

    const response = await app.fetch(request("/thing", { method: "OPTIONS" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, POST, HEAD, OPTIONS");
    expect((await app.fetch(request("/nope", { method: "OPTIONS" }))).status).toBe(404);
  });

  test("path parameters are URL-decoded", async () => {
    const app = new Router();
    app.get("/files/{name}", { path: z.object({ name: z.string() }) }, ({ path }) => path);

    const response = await app.fetch(request("/files/a%20b%2Fc%C3%A9"));

    expect(await response.json()).toEqual({ name: "a b/cé" });
  });

  test("path template names must match the path schema", () => {
    const app = new Router();

    expect(() =>
      app.get("/users/{id}", { path: z.object({ userId: z.string() }) }, () => null),
    ).toThrow('Path parameters {id} in "/users/{id}" do not match the path schema keys {userId}');
  });

  test("static parts of a parameterised path are matched literally", async () => {
    const app = new Router();
    app.get("/files/{name}.json", { path: z.object({ name: z.string() }) }, ({ path }) => path);

    expect(await (await app.fetch(request("/files/a.json"))).json()).toEqual({ name: "a" });
    expect((await app.fetch(request("/files/aXjson"))).status).toBe(404);
  });

  test.each([
    ["users", 'Route paths must start with "/": "users"'],
    ["/{1d}", 'Invalid or duplicate path parameter "1d" in "/{1d}"'],
    ["/{id}/{id}", 'Invalid or duplicate path parameter "id" in "/{id}/{id}"'],
  ])("rejects the route path %s", (path, message) => {
    expect(() => new Router().get(path, () => null)).toThrow(message);
  });

  test.each(["api", "/api/"])("rejects the router prefix %s", (prefix) => {
    expect(() => new Router().includeRouter(prefix, new Router())).toThrow(
      `Router prefixes must start with "/" and not end with "/": "${prefix}"`,
    );
  });

  test("custom regex convertors may contain braces", async () => {
    const app = new Router();
    app.get("/codes/{code:\\d{3}}", ({ path }) => path);

    expect(await (await app.fetch(request("/codes/123"))).json()).toEqual({ code: "123" });
    expect((await app.fetch(request("/codes/1234"))).status).toBe(404);
  });

  test("the OpenAPI route only answers GET and HEAD", async () => {
    const app = new Router({ openApi: {} });

    const response = await app.fetch(request("/openapi.json", { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect((await app.fetch(request("/openapi.json", { method: "HEAD" }))).status).toBe(200);
  });

  test("the OpenAPI path is configurable", async () => {
    const app = new Router({ openApi: { path: "/schema.json" } });

    expect((await app.fetch(request("/schema.json"))).status).toBe(200);
    expect((await app.fetch(request("/openapi.json"))).status).toBe(404);
  });
});
