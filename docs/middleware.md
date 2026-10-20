# Middleware and state

```ts title="app.ts"
--8<-- "docs/examples/middleware.ts"
```

Every router has a state type. Handlers read it as `state`, and middleware turns the state of an outer router into the state of the router inside it.

## State

`Router<State>` declares the state its handlers see. You pass it to `fetch`:

```ts
const app = new Router<{ env: Env }>();
app.fetch(request, { env });
```

`fetch` requires the state argument when the router declares one, and makes it optional when the state is `undefined`. A Worker gets `env` on every request, so the example above builds the state in its `fetch` export.

## Middleware

A middleware receives a context and `next`:

```ts
const timing: Middleware<State, State> = async ({ request, url, state }, next) => {
  const start = performance.now();
  const response = await next(state);
  response.headers.set("server-timing", `app;dur=${performance.now() - start}`);
  return response;
};
```

| Name | Description |
| --- | --- |
| `request` | The original `Request` |
| `url` | The parsed `URL` |
| `state` | The outer state |
| `next(state)` | Runs the rest of the router with the inner state, and returns its `Response` |

The type `Middleware<Outer, Inner>` says what the middleware takes and what it passes on. In the example, `auth` takes `{ env }` and passes `{ env, user }`, so every handler in `admin` can use `state.user` without checking for it.

A middleware can return early instead of calling `next`, or throw a `ResponseError`:

```ts
throw new ResponseError(401, "Not authenticated");
```

## Attaching middleware

| Call | Effect |
| --- | --- |
| `new Router<Outer, Inner>({ middleware })` | The router runs `middleware` around its own routes |
| `router.addMiddleware(middleware)` | Returns a new router that runs `middleware`, then `router` |

`addMiddleware` is the one you usually want: it keeps the inner router typed by the state its handlers need, and wraps it in a router typed by the state it receives. The types check that the chain lines up, across any number of nested routers.

Middleware only runs for requests routed into its router. In the example, `/health` does not run `auth`.

## Lifespan

tastapi has no startup or shutdown hooks. You build the state once, outside the app, and pass it in:

```ts title="app.ts"
--8<-- "docs/examples/lifespan.ts"
```

There is no global state to reset between tests: each test can build its own state and call `fetch`.

!!! note "Per-request state on Workers"
    Cloudflare Workers pass `env` and `ctx` to every request, and they may differ between requests. Build the state inside `fetch`, as the middleware example does, instead of caching it at module scope.
