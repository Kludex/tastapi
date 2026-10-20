# OpenAPI

```ts title="app.ts"
--8<-- "docs/examples/openapi.ts"
```

Set `openApi` on the router you call `fetch` on, and it serves an OpenAPI 3.1 document at `/openapi.json`. The document comes from the same schemas that validate requests, so it cannot drift from what the app accepts.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `title` | `"API"` | `info.title` |
| `version` | `"0.1.0"` | `info.version`, the version of your API |
| `description` | None | `info.description` |
| `path` | `"/openapi.json"` | Where the document is served |
| `servers` | None | `servers` |
| `securitySchemes` | None | `components.securitySchemes` |

The document is built on the first request and cached. Registering a route on the router clears the cache.

Call `app.openApiDocument()` to get the document without a request, for example to write it to a file in CI.

## What goes into the document

| Route option | OpenAPI |
| --- | --- |
| `path`, `query`, `headers`, `cookies` | `parameters`, one per schema field, with its JSON Schema |
| `body` | `requestBody` with `application/json` |
| `response`, `responses`, `status` | `responses` |
| `summary`, `description`, `tags`, `deprecated`, `security` | The same fields on the operation |
| `operationId` | `operationId`. Defaults to the method and path: `GET /users/{id}` is `getUsersById`. |

Path parameters without a schema get a schema from their convertor: `{id:int}` is an integer, `{id:uuid}` is a string with `format: uuid`.

Every route with inputs also documents its `422` response, using the `HTTPValidationError` schema.

Operation ids must be unique. When two routes produce the same one, the second gets a number: `getUsers2`. Set `operationId` to choose a better name.

## Named schemas

Give a schema an id with `.meta({ id })`, and it goes into `components.schemas` once, referenced with `$ref` everywhere it is used:

```ts
const User = z.object({ id: z.number(), name: z.string() }).meta({ id: "User" });
```

Code generators turn components into named types, so `User` becomes a `User` class or interface instead of an anonymous inline type per operation.

!!! note "Input and output schemas can differ"
    A schema can describe different JSON as a request than as a response. A field with a `.default()` is optional in a request but always present in a response. When the two versions differ, tastapi emits both, as `User-Input` and `User-Output`.

## Leaving routes out

| Option | Effect |
| --- | --- |
| `{ includeInSchema: false }` on a route | Leaves the route out |
| `new Router({ includeInSchema: false })` | Leaves every route of that router out |
| `includeRouter(prefix, router, { includeInSchema: false })` | Leaves that mount out |

## Swagger UI

```ts
import { swagger } from "tastapi";

app.includeRouter("/docs", swagger());
```

`swagger(openApiUrl = "/openapi.json")` returns a router that serves Swagger UI. It loads Swagger UI from a pinned version on the jsDelivr CDN, so nothing is bundled into your app. The router is left out of the OpenAPI document.
