# tastapi

A typed, FastAPI-style web framework for TypeScript, built on `zod` and the standard `fetch` API.

```ts
import { Router } from "tastapi";
import { z } from "zod";

const app = new Router({ openApi: { title: "Example" } });

app.get(
  "/users/{id:int}",
  {
    pathSchema: z.object({ id: z.coerce.number() }),
    responseSchema: z.object({ id: z.number(), name: z.string() }),
    summary: "Get a user",
  },
  ({ path }) => ({ id: path.id, name: "Ada" }),
);

export default { fetch: (request: Request) => app.fetch(request) };
```

This file is the plan to take the framework from "vendored folder in one app" to a published, production-ready package.

## Starting point

`src/` is a verbatim copy of `worker/src/framework/` from `pydantic/paig-console` at commit `066fbdee20bcb20011b0ac58adfb02d40133140e`. Authors: Samuel Colvin, David Montague. `src/README.upstream.md` is the upstream usage guide.

| File | Lines | What it does |
| --- | --- | --- |
| `router.ts` | 482 | `Router`: route registration, matching, validation, middleware, error responses |
| `types.ts` | 145 | Route, match, middleware and handler types |
| `openApi.ts` | 154 | OpenAPI 3.1 document from registered routes |
| `swagger.ts` | 57 | Swagger UI sub-router |
| `utils.ts` | 54 | `jsonResponse`, `textResponse`, `ResponseError`, `ValidationResponseError` |
| `db.ts` | 190 | Postgres helper on `pg`. App code, not framework. |
| `index.ts` | 10 | Exports |

There is no `package.json`, `tsconfig.json` or test suite yet. The upstream tests live in the app and drive the whole Worker, so none of them carry over.

!!! warning "Licensing comes before publishing"
    `pydantic/paig-console` is an internal repository with no license. Get written agreement from Pydantic to release this code under an open-source license (MIT, matching Starlette) before pushing this repository anywhere public. Until then, keep it local or private.

## Goals

- **Runtime-agnostic.** The only interface is `fetch(request: Request): Promise<Response>`. It runs on Cloudflare Workers, Bun, Deno and Node (via a small adapter) without changes.
- **Typed end to end.** Handler arguments are inferred from schemas. A wrong return type is a compile error.
- **FastAPI semantics where they fit.** Validation errors are `422`, response models filter output, OpenAPI is generated from the same schemas.
- **Small.** No runtime dependencies besides `zod`. Target under 1,500 lines of source.

## Non-goals

- Database helpers, auth, sessions, CORS presets, templating. Apps bring their own.
- A dependency-injection system. Middleware with typed state covers it.
- Backwards compatibility with the upstream API. paig-console keeps its copy.

## Phase 0 - Project setup

- `package.json`: name `tastapi`, `"type": "module"`, ESM only, `exports` map, `zod` as a peer dependency (`^4`).
- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Tooling: oxlint, oxc-format (100 columns, 2 spaces, double quotes, semicolons), `tsgo` for type checking, `vitest` with `@vitest/coverage-v8`, coverage threshold 100%.
- Build with `tsdown` (or `tsc` emitting `.js` + `.d.ts`). Ship types.
- CI on GitHub Actions: lint, format check, type check, tests with coverage, on Node 20/22/24, Bun and Deno. Workers tests via `@cloudflare/vitest-pool-workers`.
- Reformat the copied files to the project style in a single commit, separate from behaviour changes, so later diffs stay readable.

## Phase 1 - Decouple from paig-console

The copied code assumes a Cloudflare Worker with paig-console's `Env` and a Postgres `DbConn`.

- Delete `db.ts`. Remove `DbConn` from `router.ts`, `types.ts` and `index.ts`.
- Remove `env` and `ctx` from handler arguments and `DispatchInit`. Apps that need them put them in typed state through middleware.
- Add `Router.fetch(request, state?)`. It parses the URL and calls `dispatch`. This is the public entry point; `dispatch` becomes internal.
- Remove the `logfire` import. Invalid responses go through an `onError` hook the app can set, defaulting to `console.error`.
- Drop the `openapi-types` dependency by inlining the few OpenAPI 3.1 types needed, or keep it as a dev-only type import.

## Phase 2 - Correctness

Known issues in the copied code. Each one gets a failing test first.

| Area | Issue |
| --- | --- |
| Sub-router matching | `startsWith(prefix)` has no segment boundary: `/api/user` captures `/api/users`. Match on `prefix` followed by `/` or end of path. |
| Sub-router fallthrough | The first prefix match wins and a `404` inside it never falls through to later routes. Decide and document: fall through on not-found. |
| Response passthrough | `responseSchema instanceof Response` is never true. A handler that returns a `Response` on a route with a `responseSchema` fails validation and becomes a `500`. Check the handler's return value, not the schema. |
| Methods | Only `get`, `post`, `delete` helpers exist. Add `put`, `patch`, `head`, `options`, and `PATCH` to `Method`. |
| `HEAD` | `HEAD` is routed to `GET` but the body is still sent. Strip it. |
| `OPTIONS` | No automatic `OPTIONS` response with `Allow`. Add one. |
| Body parsing | Always `request.json()`. Check `Content-Type`, return `415` for non-JSON, and give an empty body a clear `422` message instead of a JSON syntax error. |
| Body size | No limit. Add a configurable limit (default 1 MiB) that returns `413`. |
| Path parameters | Values are not URL-decoded. Names in the path template are not checked against `pathSchema` keys. Check at registration and throw. |
| Error shapes | `404`/`405`/`500` bodies are JSON strings like `"404: Page not found"`. Use one shape everywhere: `{ "detail": ... }`, as FastAPI does. |
| Swagger | `swagger.ts` proxies assets from `raw.githubusercontent.com` at request time and reads them with `.text()`, which corrupts PNGs. Load Swagger UI from a pinned CDN URL in the HTML instead and delete the proxy route. |
| `ResponseError` | Redeclares `message`. Make the body overridable (`detail: unknown`) and allow extra headers. |
| `jsonResponse` | Appends `\n`. Remove it. |
| Middleware | `addMiddleware` wraps the router in a new one with the same OpenAPI config, so `/openapi.json` is served twice in the tree. Fix and test. |

## Phase 3 - API shape

Settle these before the first release; they are hard to change later.

- **Route options.** Rename `pathSchema`, `querySchema`, `bodySchema`, `responseSchema` to `path`, `query`, `body`, `response`. Add `tags`, `operationId`, `deprecated`, `status` (default success code).
- **Multiple responses.** Upstream encodes status codes as a union of `{ "201": schema }` objects. Replace with an explicit `responses: { 201: schema, 404: schema }` map and a typed `respond(status, data)` helper returned from the handler.
- **Headers and cookies.** Add `headers` and `cookies` schemas alongside `query`.
- **Typed state.** Keep the `Router<Outer, Inner>` middleware design: middleware turns the outer state into the inner state the handlers see. Document it with an auth example. Check that inference holds across three nested routers.
- **Non-JSON responses.** Handlers can return a `Response` directly on any route. Add `text`, `html`, `redirect` and `stream` helpers that produce `Response`s.
- **Lifespan.** No global state. The app builds state once and passes it to `fetch(request, state)`.

## Phase 4 - OpenAPI

- Path and query parameters carry their JSON Schema, not just a name.
- Named schemas (`z.object(...).meta({ id: "User" })`) go into `components.schemas` and are referenced with `$ref`.
- `tags`, `operationId` (default derived from method and path), `deprecated`, `security` from route options.
- Validate the generated document against the OpenAPI 3.1 meta-schema in tests.
- Snapshot test one realistic app's document.

## Phase 5 - Performance

- Routing is a linear scan with one regex per route. Benchmark with 200 routes before changing anything. If it matters, compile static prefixes into a radix tree and keep regexes only for parameter segments.
- Build the OpenAPI document once on first request and cache it.
- Benchmark against `hono` and `itty-router` on Node and Workers, and publish the numbers in the docs.

## Phase 6 - Docs and release

- Docs site with MkDocs Material, written as reference pages: routing, path parameters, validation, responses, middleware and state, errors, OpenAPI, deployment per runtime.
- Every page starts with a complete runnable example. Examples are type-checked and run in CI.
- `0.1.0` on npm and JSR once phases 0 to 4 are done. Changelog from the first release.

## Testing

- Tests call `router.fetch(new Request(...))` and assert on the `Response`. No test imports anything outside the public `index.ts`.
- One test file per public concern: `routing.test.ts`, `validation.test.ts`, `responses.test.ts`, `middleware.test.ts`, `openapi.test.ts`, `swagger.test.ts`.
- Type-level tests with `expectTypeOf` for handler argument inference and return type checking.
- 100% line and branch coverage. A line that cannot be reached through `fetch` gets `/* v8 ignore next */` with a reason.

## Order of work

1. Phase 0, then reformat.
2. Phase 1, with a minimal routing test suite to lock current behaviour.
3. Phase 2, one issue per commit, test first.
4. Phase 3. Write the docs examples for the new API before implementing it.
5. Phase 4, then phase 5, then phase 6.

## Downstream

`cvedex` (`~/dev/personal/cvedex`) is the first user. Its server needs: nested routers, middleware with typed state (auth, agent approval, audit), path parameters, and a catch-all that forwards unmatched `/api/*` requests upstream. The catch-all is a route on all methods with a `{rest:path}` parameter; add an `all()` helper in phase 3 for it.
