# tastapi

A typed, FastAPI-style web framework for TypeScript, built on [zod](https://zod.dev) and the fetch API.

```ts
import { Router } from "tastapi";
import * as z from "zod";

export const app = new Router({ openApi: { title: "Example" } });

app.get(
  "/users/{id:int}",
  {
    path: z.object({ id: z.coerce.number() }),
    response: z.object({ id: z.number(), name: z.string() }),
    summary: "Get a user",
  },
  ({ path }) => ({ id: path.id, name: "Ada" }),
);

export default { fetch: (request: Request) => app.fetch(request) };
```

`path.id` is a `number` because the path schema says so, and returning `{ id: "1" }` is a compile error because the response schema says `id` is a number. The same schemas validate the request, filter the response and generate the OpenAPI document served at `/openapi.json`.

## Install

```sh
npm install tastapi zod
```

## Run

| Runtime | Command |
| --- | --- |
| Cloudflare Workers | `npx wrangler dev app.ts` |
| Bun | `bun run app.ts` |
| Deno | `deno serve app.ts` |
| Node | `toNodeListener` from `tastapi/node` |

## Features

- Handler arguments typed from `path`, `query`, `headers`, `cookies` and `body` schemas.
- `422` validation errors in FastAPI's `{ "detail": [...] }` shape.
- Response schemas that check the return type and filter the output.
- OpenAPI 3.1 with named components, and Swagger UI with `swagger()`.
- Middleware that turns one router's typed state into the next.
- No runtime dependencies besides zod.

See the [documentation](docs/index.md) for routing, validation, responses, middleware, errors, OpenAPI and deployment.

## Development

```sh
npm install
npm run check     # lint, format, type check, tests with 100% coverage
npm run docs      # build the docs site with MkDocs Material
npm run bench     # benchmark against hono and itty-router
```

## License

MIT. tastapi started from the router in `pydantic/paig-console`, by Samuel Colvin and David Montague.
