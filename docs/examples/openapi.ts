import { Router, swagger } from "tastapi";
import { z } from "zod";

const User = z.object({ id: z.number(), name: z.string() }).meta({ id: "User" });

export const app = new Router({
  openApi: {
    title: "Users API",
    version: "1.0.0",
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
  },
});

app.get(
  "/users",
  {
    query: z.object({ limit: z.coerce.number().int().max(100).default(10) }),
    response: z.array(User),
    summary: "List users",
    tags: ["users"],
  },
  () => [{ id: 1, name: "Ada" }],
);

app.get(
  "/users/{id:int}",
  {
    path: z.object({ id: z.coerce.number() }),
    response: User,
    tags: ["users"],
    operationId: "getUser",
    security: [{ bearer: [] }],
  },
  ({ path }) => ({ id: path.id, name: "Ada" }),
);

app.delete("/users/{id:int}", { deprecated: true, tags: ["users"] }, () => null);

app.includeRouter("/docs", swagger());
