import { Router } from "tastapi";
import { z } from "zod";

export const app = new Router();

app.get(
  "/search",
  {
    query: z.object({
      q: z.string().min(1),
      page: z.coerce.number().int().min(1).default(1),
      tag: z.array(z.string()).default([]),
    }),
  },
  ({ query }) => ({ q: query.q, page: query.page, tags: query.tag }),
);

app.post(
  "/items",
  {
    body: z.object({ name: z.string(), price: z.number().positive() }),
    headers: z.object({ "x-request-id": z.string().optional() }),
    cookies: z.object({ session: z.string() }),
    status: 201,
  },
  ({ body, headers, cookies }) => ({
    ...body,
    requestId: headers["x-request-id"] ?? null,
    session: cookies.session,
  }),
);
