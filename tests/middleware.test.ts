import { Router, type Middleware } from "tastapi";
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
});
