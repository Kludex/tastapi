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
    app.get("/users/{id:int}", { pathSchema: z.object({ id: z.coerce.number() }) }, ({ path }) => ({
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
  });

  test("method not allowed", async () => {
    const app = new Router();
    app.get("/hello", {}, () => "hi");

    const response = await app.fetch(request("/hello", { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
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
});
