import { type Middleware, Router } from "tastapi";
import { describe, expectTypeOf, test } from "vitest";
import * as z from "zod";

describe("handler arguments", () => {
  test("path parameters come from the template", () => {
    new Router().get("/users/{id:int}/posts/{slug}", ({ path, query, body }) => {
      expectTypeOf(path).toEqualTypeOf<{ id: string; slug: string }>();
      expectTypeOf(query).toEqualTypeOf<undefined>();
      expectTypeOf(body).toEqualTypeOf<undefined>();
    });
  });

  test("schemas set the argument types", () => {
    new Router().post(
      "/users/{id}",
      {
        path: z.object({ id: z.coerce.number() }),
        query: z.object({ page: z.coerce.number().default(1) }),
        headers: z.object({ "x-token": z.string() }),
        cookies: z.object({ session: z.string().optional() }),
        body: z.object({ name: z.string() }),
      },
      ({ path, query, headers, cookies, body, request, url }) => {
        expectTypeOf(path).toEqualTypeOf<{ id: number }>();
        expectTypeOf(query).toEqualTypeOf<{ page: number }>();
        expectTypeOf(headers).toEqualTypeOf<{ "x-token": string }>();
        expectTypeOf(cookies).toEqualTypeOf<{ session?: string | undefined }>();
        expectTypeOf(body).toEqualTypeOf<{ name: string }>();
        expectTypeOf(request).toEqualTypeOf<Request>();
        expectTypeOf(url).toEqualTypeOf<URL>();
      },
    );
  });

  test("state is the router's inner state", () => {
    new Router<{ user: string }>().get("/", ({ state }) => {
      expectTypeOf(state).toEqualTypeOf<{ user: string }>();
    });
  });
});

describe("return types", () => {
  const app = new Router();
  const User = z.object({ id: z.number() });

  test("must match the response schema", () => {
    app.get("/ok", { response: User }, () => ({ id: 1 }));
    app.get("/response", { response: User }, () => new Response());
    // @ts-expect-error a string id does not match the schema
    app.get("/wrong", { response: User }, () => ({ id: "1" }));
    // @ts-expect-error async handlers are checked too
    app.get("/wrong-async", { response: User }, async () => ({ id: "1" }));
  });

  test("respond is typed by status", () => {
    app.get(
      "/users/{id}",
      { response: User, responses: { 404: z.object({ detail: z.string() }) } },
      ({ respond }) => {
        respond(200, { id: 1 });
        respond(404, { detail: "missing" });
        // @ts-expect-error 404 takes a detail
        respond(404, { id: 1 });
        // @ts-expect-error 500 is not declared
        return respond(500, {});
      },
    );
  });

  test("status changes the status respond expects for the response schema", () => {
    app.post("/users", { response: User, status: 201 }, ({ respond }) => {
      // @ts-expect-error 200 is not declared
      respond(200, { id: 1 });
      return respond(201, { id: 1 });
    });
  });

  test("respond takes any status when nothing is declared", () => {
    app.get("/", ({ respond }) => respond(202, { anything: true }));
  });
});

describe("state", () => {
  test("fetch requires state only when the router needs it", () => {
    const request = new Request("http://test/");
    void new Router().fetch(request);
    void new Router<{ user: string }>().fetch(request, { user: "Ada" });
    // @ts-expect-error state is required
    void new Router<{ user: string }>().fetch(request);
  });

  test("inference holds across three nested routers", () => {
    type Env = { env: string };
    type Authed = Env & { user: string };
    type Audited = Authed & { audit: string[] };

    const auth: Middleware<Env, Authed> = ({ state }, next) => next({ ...state, user: "Ada" });
    const audit: Middleware<Authed, Audited> = ({ state }, next) => next({ ...state, audit: [] });

    const leaf = new Router<Audited>();
    leaf.get("/me", ({ state }) => {
      expectTypeOf(state).toEqualTypeOf<Audited>();
    });
    const middle = new Router<Authed>();
    middle.get("/me", ({ state }) => {
      expectTypeOf(state).toEqualTypeOf<Authed>();
    });
    middle.includeRouter("/audited", leaf.addMiddleware(audit));
    const root = new Router<Env>();
    root.includeRouter("/authed", middle.addMiddleware(auth));

    expectTypeOf(leaf.addMiddleware(audit)).toEqualTypeOf<Router<Authed, Audited>>();
    expectTypeOf(middle.addMiddleware(auth)).toEqualTypeOf<Router<Env, Authed>>();
    // @ts-expect-error the leaf needs audited state, not the root's
    root.includeRouter("/leaf", leaf);
  });
});
