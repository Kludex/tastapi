# Responses

```ts title="app.ts"
--8<-- "docs/examples/responses.ts"
```

A handler returns data or a `Response`.

| Handler returns | Response |
| --- | --- |
| Data | Serialized as JSON with the route's `status` (default `200`) |
| `undefined` | `null` |
| A `Response` | Sent as is |
| `respond(status, data)` | Serialized as JSON with `status` |

Statuses that cannot have a body (`204`, `205`, `304`) are sent without one, whatever the handler returns.

## Response schemas

`response` validates and filters what the handler returns. `GET /me` above returns a `password` field, and the client gets:

```json
{"id":1,"name":"Ada"}
```

The schema is the contract, so a field you forgot to remove never leaks. The return type is checked too: returning `{ id: "1" }` is a compile error.

!!! warning "Invalid responses are a server error"
    If the data still fails the schema at runtime, the client gets `500 {"detail": "Internal Server Error"}`, and `onError` receives an `InvalidResponseError` with the issues and the data. The client never sees data that breaks the contract.

A `Response` returned from the handler skips the schema. That is how you return text, HTML, redirects or streams from any route.

## Other status codes

Declare each status in `responses`, and build the response with `respond`:

```ts
app.get(
  "/users/{id:int}",
  { response: User, responses: { 404: NotFound } },
  ({ respond }) => respond(404, { detail: "User not found" }),
);
```

`respond` is typed by status: `respond(404, ...)` must match `NotFound`, and `respond(500, ...)` is a compile error because `500` is not declared. It also takes headers: `respond(201, user, { headers: { location: "/users/2" } })`.

`response` is shorthand for `responses: { [status]: schema }`, where `status` defaults to `200`.

## Response helpers

| Helper | `Content-Type` |
| --- | --- |
| `json(data, options?)` | `application/json` |
| `text(body, options?)` | `text/plain; charset=utf-8` |
| `html(body, options?)` | `text/html; charset=utf-8` |
| `redirect(url, status = 307, options?)` | None. Sets `Location`. |
| `stream(source, options?)` | `application/octet-stream` |

`options` takes `status` and `headers`. A `content-type` in `headers` replaces the default.

`stream` takes a `ReadableStream` or an async iterable of strings or bytes. When the client disconnects, the iterable's `return()` runs, so `finally` blocks in a generator clean up.

!!! tip "Why 307"
    `redirect` defaults to `307 Temporary Redirect`, which keeps the method and body. A `302` lets clients turn a `POST` into a `GET`.
