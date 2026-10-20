# Routing

```ts title="app.ts"
--8<-- "docs/examples/routing.ts"
```

A `Router` holds routes and other routers. You register a route with a method helper, and mount a router under a prefix with `includeRouter`.

## Method helpers

| Helper | Matches |
| --- | --- |
| `get`, `post`, `put`, `patch`, `delete`, `head`, `options` | That method |
| `route(methods, path, ...)` | Each method in `methods` |
| `all(path, ...)` | Every method |

Each helper takes a path, optional [route options](#route-options) and a handler:

```ts
app.get("/items", () => []);
app.get("/items", { summary: "List items" }, () => []);
```

## Matching order

Routes match in the order you register them, and the first match wins. A router mounted with `includeRouter` takes part in the same order: if nothing inside it matches, matching continues with the routes registered after it.

!!! tip "Register specific routes first"
    `/users/me` must come before `/users/{id}`, or `me` is captured as an `id`.

A prefix only matches on a segment boundary. A router mounted at `/api/user` handles `/api/user` and `/api/user/1`, but not `/api/users`.

Prefixes start with `/`, do not end with `/`, and cannot contain parameters. Use `""` to mount a router without a prefix. Inside a mounted router, the route `""` matches the prefix itself and `"/"` matches the prefix with a trailing slash.

## Automatic responses

| Request | Response |
| --- | --- |
| No route matches the path | `404 {"detail": "Not Found"}` |
| The path matches, the method does not | `405 {"detail": "Method Not Allowed"}` with an `Allow` header |
| `OPTIONS` with no explicit route | `204` with an `Allow` header |
| `HEAD` with no explicit route | The `GET` route runs, and the body is dropped |

## Route options

| Option | Description |
| --- | --- |
| `path`, `query`, `headers`, `cookies`, `body` | Input schemas. See [Validation](validation.md). |
| `response` | Schema for the success response. See [Responses](responses.md). |
| `responses` | Schemas for other status codes, used by `respond`. |
| `status` | Success status code. Defaults to `200`. |
| `summary`, `description`, `tags`, `operationId`, `deprecated`, `security` | OpenAPI metadata. See [OpenAPI](openapi.md). |
| `includeInSchema` | Set to `false` to leave the route out of the OpenAPI document. |

## Handler arguments

The handler receives one object:

| Argument | Type |
| --- | --- |
| `path`, `query`, `headers`, `cookies`, `body` | The parsed input, typed from the schema |
| `request` | The original `Request` |
| `url` | The parsed `URL` |
| `state` | The router's state. See [Middleware and state](middleware.md). |
| `respond` | Builds a response for a declared status code |

## Router options

```ts
const app = new Router({
  openApi: { title: "My API" },
  maxBodySize: 64 * 1024,
  onError: (error) => console.error(error),
});
```

| Option | Description |
| --- | --- |
| `openApi` | Serve an OpenAPI document. Applies to the router you call `fetch` on. |
| `middleware` | Runs around every request routed through this router. |
| `onError` | Receives unhandled errors and invalid responses. Defaults to `console.error`. |
| `maxBodySize` | Largest accepted request body, in bytes. Defaults to 1 MiB. |
| `includeInSchema` | Set to `false` to leave every route of this router out of the OpenAPI document. |
