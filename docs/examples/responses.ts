import { html, json, redirect, Router, stream, text } from "tastapi";
import * as z from "zod";

const User = z.object({ id: z.number(), name: z.string() });
const NotFound = z.object({ detail: z.string() });

export const app = new Router();

app.get("/me", { response: User }, () => ({ id: 1, name: "Ada", password: "hunter2" }));

app.get(
  "/users/{id:int}",
  {
    path: z.object({ id: z.coerce.number() }),
    response: User,
    responses: { 404: NotFound },
  },
  ({ path, respond }) => {
    if (path.id !== 1) {
      return respond(404, { detail: "User not found" });
    }
    return { id: 1, name: "Ada" };
  },
);

app.post(
  "/users",
  { body: User.omit({ id: true }), response: User, status: 201 },
  ({ body, respond }) => respond(201, { id: 2, ...body }, { headers: { location: "/users/2" } }),
);

app.get("/hello.txt", () => text("Hello, world!"));
app.get("/hello.html", () => html("<h1>Hello, world!</h1>"));
app.get("/old", () => redirect("/new"));
app.get("/data.json", () => json({ pretty: true }, { headers: { "cache-control": "no-store" } }));
app.get("/events", () =>
  stream(
    (async function* () {
      yield "data: one\n\n";
      yield "data: two\n\n";
    })(),
    { headers: { "content-type": "text/event-stream" } },
  ),
);
