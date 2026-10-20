import { type Middleware, ResponseError, Router } from "tastapi";
import { describe, expect, test } from "vitest";

const request = (path: string) => new Request(`http://test${path}`);

describe("middleware", () => {
  test("turns the outer state into the inner state", async () => {
    const auth: Middleware<{ token: string }, { user: string }> = ({ state }, next) =>
      next({ user: state.token.toUpperCase() });
    const app = new Router<{ user: string }>();
    app.get("/me", {}, ({ state }) => state);

    const response = await app.addMiddleware(auth).fetch(request("/me"), { token: "ada" });

    expect(await response.json()).toEqual({ user: "ADA" });
  });

  test("the wrapped router serves one OpenAPI document covering every route", async () => {
    const app = new Router({ openApi: { title: "Example" } });
    app.get("/inner", {}, () => null);
    const wrapped = app.addMiddleware<undefined>(({ state }, next) => next(state));
    wrapped.get("/outer", {}, () => null);

    const response = await wrapped.fetch(request("/openapi.json"));
    const document = await response.json();

    expect(Object.keys(document.paths)).toEqual(["/inner", "/outer"]);
  });

  test("the root middleware runs on every request", async () => {
    const seen: string[] = [];
    const app = new Router<undefined, undefined>({
      middleware: async ({ url, state }, next) => {
        seen.push(url.pathname);
        return next(state);
      },
    });
    app.get("/a", () => null);

    await app.fetch(request("/a"));
    await app.fetch(request("/missing"));

    expect(seen).toEqual(["/a", "/missing"]);
  });

  test("a ResponseError thrown by the root middleware becomes its response", async () => {
    const app = new Router({
      middleware: () => {
        throw new ResponseError(401, "Not authenticated");
      },
    });

    const response = await app.fetch(request("/"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Not authenticated" });
  });

  test("outer middleware sees a ResponseError from inside as a response", async () => {
    const inner = new Router();
    inner.get("/", () => {
      throw new ResponseError(404, "Nope");
    });
    const app = new Router({
      middleware: async ({ state }, next) => {
        const response = await next(state);
        response.headers.set("x-seen", String(response.status));
        return response;
      },
    });
    app.includeRouter("/inner", inner);

    const response = await app.fetch(request("/inner/"));

    expect(response.headers.get("x-seen")).toBe("404");
    expect(await response.json()).toEqual({ detail: "Nope" });
  });
});
