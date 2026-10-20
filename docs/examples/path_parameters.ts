import { Router } from "tastapi";
import * as z from "zod";

export const app = new Router();

app.get("/files/{name}", ({ path }) => ({ name: path.name }));

app.get(
  "/users/{id:int}",
  { path: z.object({ id: z.coerce.number().int().positive() }) },
  ({ path }) => ({ id: path.id }),
);

app.get("/orders/{orderId:uuid}", ({ path }) => ({ orderId: path.orderId }));

app.get("/static/{file:path}", ({ path }) => ({ file: path.file }));

app.get("/tags/{tag:[a-z]+}", ({ path }) => ({ tag: path.tag }));
