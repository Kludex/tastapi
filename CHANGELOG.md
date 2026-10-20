# Changelog

## 0.1.0 (unreleased)

The first release. tastapi started from the router in `pydantic/paig-console`, by Samuel Colvin and David Montague, and was reworked into a standalone framework.

### Added

- `Router` with `get`, `head`, `post`, `put`, `patch`, `delete`, `options`, `all` and `route` helpers, and `includeRouter` for nested routers.
- `path`, `query`, `headers`, `cookies` and `body` schemas, with `422 {"detail": [...]}` validation errors.
- `response` and `responses` schemas, a typed `respond(status, data)` helper, and a `status` option for the default success code.
- Path convertors: `str`, `int`, `float`, `uuid`, `path` and custom regular expressions.
- Typed router state and `Middleware<Outer, Inner>`, with `addMiddleware`.
- `json`, `text`, `html`, `redirect` and `stream` response helpers.
- `ResponseError(status, detail, { headers })` and an `onError` hook.
- Automatic `HEAD`, `OPTIONS` and `405` responses with an `Allow` header.
- `415` for non-JSON bodies and `413` above `maxBodySize` (1 MiB by default).
- OpenAPI 3.1 documents with parameters, request bodies, responses, named components, tags, operation ids, deprecation and security, and a `swagger()` router.
- `tastapi/node`, an adapter from `fetch` handlers to `node:http`.
