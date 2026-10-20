import { Router } from "tastapi";
import * as z from "zod";

export const app = new Router({ openApi: { title: "Example" } });

app.get(
  "/users/{id:int}",
  {
    path: z.object({ id: z.coerce.number() }),
    response: z.object({ id: z.number(), name: z.string() }),
    summary: "Get a user",
  },
  ({ path }) => ({ id: path.id, name: "Ada" }),
);

export default { fetch: (request: Request) => app.fetch(request) };
