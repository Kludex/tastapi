import { Router } from "tastapi";

export const app = new Router();

app.get("/", () => ({ message: "Hello, world!" }));

export default { fetch: (request: Request) => app.fetch(request) };
