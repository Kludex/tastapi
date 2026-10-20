# Path parameters

```ts title="app.ts"
--8<-- "docs/examples/path_parameters.ts"
```

A path parameter is a name in braces: `{name}`. Its value is available as `path.name` in the handler.

## Convertors

A convertor after a colon restricts what the parameter matches:

| Template | Matches | Example |
| --- | --- | --- |
| `{name}` or `{name:str}` | One segment, no `/` | `/files/report.pdf` |
| `{id:int}` | Digits | `/users/42` |
| `{price:float}` | Digits with an optional fraction | `/prices/9.99` |
| `{id:uuid}` | A UUID | `/orders/0b8f...` |
| `{file:path}` | The rest of the path, `/` included | `/static/css/site.css` |
| `{tag:[a-z]+}` | Any other text is used as a regular expression | `/tags/news` |

A path that does not match the convertor does not match the route, so the response is a `404`, not a `422`. The value still arrives as a string.

!!! tip "Convert with a schema"
    `{id:int}` only decides whether the route matches. Add `path: z.object({ id: z.coerce.number() })` to get a `number` in the handler.

## Path schemas

Without a schema, every parameter is a `string`, typed from the template itself:

```ts
app.get("/users/{id}/posts/{slug}", ({ path }) => path.slug);
//                                    ^? { id: string; slug: string }
```

With a schema, the handler gets the parsed output. A value that fails the schema gets a `422`.

The schema keys must be exactly the parameter names. A mismatch throws when you register the route, not on the first request, so a typo cannot ship.

## Decoding

Values are percent-decoded before validation: `/files/a%20b` gives `"a b"`. An invalid escape such as `%E0%A4%A` gets a `422` with the type `invalid_encoding`.
