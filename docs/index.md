# tastapi

tastapi is a typed, FastAPI-style web framework for TypeScript. You describe each route with [zod](https://zod.dev) schemas, and tastapi validates the request, types the handler, filters the response and generates an OpenAPI document from the same schemas.

```ts title="app.ts"
--8<-- "docs/examples/quickstart.ts"
```

The handler receives `path.id` as a `number`, because the path schema says so. Returning `{ id: "1" }` is a compile error, because the response schema says `id` is a number.

## Install

```sh
npm install tastapi zod
```

`zod` is a peer dependency. tastapi needs zod 4.

## Run it

The app exports `{ fetch }`, the interface every modern JavaScript runtime understands:

| Runtime | Command |
| --- | --- |
| Cloudflare Workers | `npx wrangler dev app.ts` |
| Bun | `bun run app.ts` |
| Deno | `deno serve app.ts` |
| Node | See [Deployment](deployment.md#node) |

Then open `http://localhost:8787/users/1` (or the port your runtime prints):

```json
{"id":1,"name":"Ada"}
```

A request to `/users/abc` does not reach the handler. The `{id:int}` convertor only matches digits, so the response is a `404`. A request that matches but fails validation gets a `422` that says which field failed and why. See [Validation](validation.md).

## What you get

- **Typed handlers.** Path, query, header, cookie and body types come from the schemas. The return type is checked against the response schema.
- **FastAPI semantics.** Validation errors are `422` with a `{ "detail": [...] }` body. Response schemas filter what you return, so an extra field like `password` never leaks.
- **OpenAPI 3.1.** Generated from the route schemas and served at `/openapi.json`. Add [Swagger UI](openapi.md#swagger-ui) with one line.
- **Any runtime.** The only interface is `fetch(request)`. tastapi runs on Cloudflare Workers, Bun, Deno and Node.
- **Small.** No runtime dependencies besides zod.

!!! note "No dependency injection"
    tastapi has no `Depends`. Middleware turns the state of one router into the typed state of the routers inside it, which covers authentication, database handles and per-request context. See [Middleware and state](middleware.md).
