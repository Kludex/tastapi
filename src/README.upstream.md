# Mini Web Framework

This is a typesafe mini web framework similar to FastAPI, but written in TypeScript using zod for validation.

It allows you to add endpoints like:

```ts
import { Router } from '@/framework'

const router = new Router()

router.get('/hello', () => {
  return { message: 'Hello, world!' }
})
```

## Request and Response Validation

You can add validation to query parameters, the request body, and the response body like this:

```ts
import { Router } from '@/framework'
import { z } from 'zod'

const router = new Router()

// note for querySchema you will generally need to use z.coerce since the input values are always strings
router.get(
  '/search-query-example',
  { querySchema: z.object({ page: z.coerce.number().min(1).default(1) }) },
  ({ query }) => {
    const { page } = query
  },
)

router.post('/body-example', { bodySchema: z.object({ name: z.string() }) }, ({ body }) => {
  const { name } = body

  return new Response(`Hello, ${name}!`)
})

router.get('/response-example', { responseSchema: z.object({ a: z.string() }) }, () => {
  return { a: '123' }
})

// You can also return responses directly, e.g.:
router.post('/model-response', {}, () => {
  return new Response(`Hello`)
})
```

## Variable paths

You can also match on paths with variables and validate the variables:

```ts
import { Router } from '@/framework'

const router = new Router()

// note for pathSchema you will generally need to use z.coerce since the input values are always strings
router.get(
  '/user/{id}',
  {
    pathSchema: z.object({ id: z.coerce.number() }),
  },
  ({ path }) => {
    const { id } = path
    return { id }
  },
)
```

You can also customize the matching logic for variables like this:

- `{id}` (alias of `{id:slug}`) uses the regex `[^\\/]+` to patch on a part of the page
- `{id:int}` uses the regex `\\d+` to match assuming `id` is numeric
- `{id:uuid}` uses the regex `[0-9a-f-]{36}` to match assuming `id` is a UUID
- `{thing:path}` matches on the entire rest of the path
- `{thing:<regex>}` uses a custom regex to match the variable, e.g. `{thing:[a-z]+}`

## Including Routes

You can include routes in other routes like this:

```ts
import { Router } from '@/framework'

const routerA = new Router()
const routerB = new Router()

routerA.use('/route-b', routerB)
```

## Type safety

Not the framework is type safe, so the type of `query`, `body`, and `response` match the interface
defined by the zod schema when running type checking (`npm run typecheck`).

## Open API Schema

an Open API schema (v3.1) can be generated for the routes too.

This will include JSON Schema from `querySchema`, `bodySchema`, and `responseSchema`.

You can set the `summary` and `description` for each route like this.

You should always include schemas and a `summary` on routes to improve the Open API schema.

```ts
import { Router } from '@/framework'

const router = new Router()

router.get(
  '/open-api-example',
  {
    summary: 'Get user',
    description: 'Get user by id',
  },
  () => {
    return { x: 1 }
  },
)
```
