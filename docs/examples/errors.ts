import { ResponseError, Router } from "tastapi";
import * as z from "zod";

export const app = new Router({
  onError: (error) => console.error("Unhandled error", error),
});

app.get("/items/{id:int}", { path: z.object({ id: z.coerce.number() }) }, ({ path }) => {
  if (path.id > 100) {
    throw new ResponseError(404, "Item not found");
  }
  return { id: path.id };
});

app.get("/teapot", () => {
  throw new ResponseError(418, { reason: "I'm a teapot" }, { headers: { "x-brew": "tea" } });
});
