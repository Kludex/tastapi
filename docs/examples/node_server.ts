import { createServer } from "node:http";
import { Router } from "tastapi";
import { toNodeListener } from "tastapi/node";

export const app = new Router();

app.get("/", () => ({ message: "Hello, world!" }));

export const server = createServer(toNodeListener((request) => app.fetch(request)));
