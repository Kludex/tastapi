# Errors

```ts title="app.ts"
--8<-- "docs/examples/errors.ts"
```

Throw a `ResponseError` anywhere in a handler or a middleware to stop and answer with an error.

## `ResponseError`

```ts
new ResponseError(status, detail, { headers });
```

The response body is `{ "detail": detail }`. `detail` can be any JSON value:

| Thrown | Response |
| --- | --- |
| `new ResponseError(404, "Item not found")` | `404 {"detail": "Item not found"}` |
| `new ResponseError(418, { reason: "I'm a teapot" }, { headers: { "x-brew": "tea" } })` | `418 {"detail": {"reason": "I'm a teapot"}}` with `x-brew: tea` |

Every error tastapi produces itself uses the same shape: `404`, `405`, `413`, `415`, `422` and `500`. Clients only need to read one format.

A `ResponseError` thrown inside a router becomes a `Response` before it leaves that router, so the middleware around it sees a normal response and can add headers to it.

## Unhandled errors

Any other error becomes `500 {"detail": "Internal Server Error"}`, and the error goes to `onError` on the router you call `fetch` on. It defaults to `console.error`.

!!! warning "Error messages are not sent to the client"
    The body of a `500` never contains the error message or stack trace. They can include secrets, SQL or file paths. Read them in `onError`, where you can send them to your logging or error tracking.

`onError` also receives an `InvalidResponseError` when a handler returns data that fails its response schema. See [Responses](responses.md#response-schemas).
