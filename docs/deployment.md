# Deployment

```ts title="app.ts"
--8<-- "docs/examples/deployment.ts"
```

tastapi apps expose `fetch(request)`. Export it as the default export, and Cloudflare Workers, Bun and Deno serve it without an adapter.

## Cloudflare Workers

```toml title="wrangler.toml"
name = "my-api"
main = "app.ts"
compatibility_date = "2026-01-01"
```

```sh
npx wrangler dev     # local development
npx wrangler deploy  # deploy
```

Workers pass `env` and `ctx` to `fetch` as extra arguments. Put them in the router's state to reach them from handlers:

```ts
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, { env, ctx }),
};
```

See [Middleware and state](middleware.md) for typing the state.

## Bun

```sh
bun run app.ts
```

Bun serves the default export when it has a `fetch` method. Set `port` next to `fetch` to change the port.

## Deno

```sh
deno serve app.ts
```

`deno serve` uses the default export. Pass `--port` to change the port.

## Node

Node's `http` module does not speak `fetch`. `tastapi/node` adapts a `fetch` handler to a `node:http` request listener:

```ts title="server.ts"
--8<-- "docs/examples/node_server.ts"

server.listen(8000);
```

The adapter streams request and response bodies, keeps multiple `Set-Cookie` headers, and aborts `request.signal` when the client disconnects.

!!! tip "Use the platform when you can"
    On Bun and Deno, prefer the default export over `tastapi/node`. Their native servers speak `fetch` directly, and skip the conversion.
