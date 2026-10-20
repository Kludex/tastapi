# Validation

```ts title="app.ts"
--8<-- "docs/examples/validation.ts"
```

Each input has its own schema. tastapi parses every input, collects every issue, and either calls the handler with the parsed values or answers `422`.

| Option | Source | Schema |
| --- | --- | --- |
| `path` | Path parameters | `z.object` |
| `query` | Query string | `z.object` |
| `headers` | Request headers | `z.object` |
| `cookies` | The `Cookie` header | `z.object` |
| `body` | JSON request body | Any zod schema |

Query, header, path and cookie values arrive as strings. Use `z.coerce.number()` or `z.stringbool()` to turn them into other types.

## Validation errors

A request to `/search?page=0` gets:

```json
{
  "detail": [
    { "type": "invalid_type", "loc": ["query", "q"], "msg": "Invalid input: expected string, received undefined" },
    { "type": "too_small", "loc": ["query", "page"], "msg": "Too small: expected number to be >=1" }
  ]
}
```

`loc` starts with the input (`path`, `query`, `headers`, `cookies` or `body`) and follows the zod path into it. `type` is the zod issue code. It is the same shape FastAPI uses, so existing clients can parse it.

## Query parameters

A repeated key keeps the last value, unless the field is an array:

| Request | `z.string()` | `z.array(z.string())` |
| --- | --- | --- |
| `?tag=a` | `"a"` | `["a"]` |
| `?tag=a&tag=b` | `"b"` | `["a", "b"]` |

Keys that are not in the schema are dropped, because `z.object` strips unknown keys. Use `z.looseObject` to keep them.

## Headers

Only the headers named in the schema are read. Use lowercase names: `x-request-id`, not `X-Request-ID`.

## Body

The body is parsed as JSON. tastapi checks the request before it reads anything:

| Request | Response |
| --- | --- |
| `Content-Type` is not JSON | `415 {"detail": "Unsupported Media Type"}` |
| Body larger than `maxBodySize` | `413 {"detail": "Request body too large"}` |
| Body is not valid JSON | `422` with the type `json_invalid` |
| Body is empty and the schema requires one | `422` with the message `Request body is required` |

A missing `Content-Type` is accepted as JSON. `application/json` and any `application/*+json` type are accepted.

!!! warning "The size limit is on by default"
    `maxBodySize` defaults to 1 MiB, and applies to both the `Content-Length` header and the bytes actually read. Without it, one large request could exhaust the memory of a Worker. Raise it per router when you need to.

Make the body optional with `.optional()`. The handler then gets `undefined` when the body is empty.
