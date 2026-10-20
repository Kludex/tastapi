# Benchmarks

Each framework serves the same app: 200 routes, list, create, read and delete for 50 resources. Every handler returns a small JSON object. The benchmark sends `GET` requests that hit the first route, the last static route, the last route with a parameter, and no route at all.

The code is in [`bench/`](https://github.com/Kludex/tastapi/tree/main/bench). Run it with:

```sh
npm run bench
```

## Node

`app.fetch(new Request(...))` called in a loop with [mitata](https://github.com/evanwashere/mitata), no network involved. This measures the framework alone.

Node 24.18.0 on an Apple M3 Max, average time per request (lower is better):

| Request | tastapi | hono 4.13 | itty-router 5.0 |
| --- | ---: | ---: | ---: |
| first static route | 5.06 µs | 3.75 µs | 4.01 µs |
| last static route | 4.76 µs | 3.65 µs | 14.67 µs |
| last parameter route | 5.28 µs | 4.18 µs | 13.30 µs |
| not found | 4.18 µs | 4.04 µs | 14.09 µs |

tastapi indexes routes by their leading literal segments, so the position of a route in a list of 200 does not change how long it takes to find it. itty-router tests every route in turn, which shows on the last route.

## Cloudflare Workers

The three apps are bundled into one Worker, run locally in workerd through Miniflare, and loaded over HTTP with [autocannon](https://github.com/mcollina/autocannon) (32 connections, 5 seconds).

Same machine, requests per second (higher is better):

| Request | tastapi | hono 4.13 | itty-router 5.0 |
| --- | ---: | ---: | ---: |
| first static route | 8,767 req/s | 8,642 req/s | 8,649 req/s |
| last static route | 8,004 req/s | 8,576 req/s | 7,422 req/s |
| last parameter route | 8,281 req/s | 8,780 req/s | 6,847 req/s |
| not found | 8,961 req/s | 9,018 req/s | 7,716 req/s |

!!! note "The runtime dominates on Workers"
    Each request costs about 115 µs end to end, and the framework accounts for about 5 µs of it. The differences in this table are within the noise of the HTTP server and the load generator. On a deployed Worker, network latency makes the gap smaller still.

## What the numbers do not show

These requests skip validation on purpose, to compare routing and response handling. A route with schemas also spends time in zod, which costs the same whichever router you put in front of it.
