import { Router } from "tastapi";

export const items = new Router();

items.get("", () => [{ id: 1 }]);
items.post("", { status: 201 }, () => ({ id: 2 }));
items.get("/{id}", ({ path }) => ({ id: path.id }));
items.delete("/{id}", () => null);

export const app = new Router();

app.includeRouter("/items", items);
app.get("/", () => ({ message: "Hello, world!" }));
app.route(["PUT", "PATCH"], "/settings", () => ({ saved: true }));
app.all("/proxy/{rest:path}", ({ path, request }) => ({ method: request.method, rest: path.rest }));
