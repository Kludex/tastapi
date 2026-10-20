import { type Middleware, ResponseError, Router } from "tastapi";

interface Env {
  API_TOKEN: string;
}

interface User {
  name: string;
}

export const auth: Middleware<{ env: Env }, { env: Env; user: User }> = async (
  { request, state },
  next,
) => {
  if (request.headers.get("authorization") !== `Bearer ${state.env.API_TOKEN}`) {
    throw new ResponseError(401, "Not authenticated", {
      headers: { "www-authenticate": "Bearer" },
    });
  }
  const response = await next({ ...state, user: { name: "Ada" } });
  response.headers.set("x-user", "Ada");
  return response;
};

export const admin = new Router<{ env: Env; user: User }>();
admin.get("/me", ({ state }) => state.user);

export const app = new Router<{ env: Env }>();
app.get("/health", () => ({ ok: true }));
app.includeRouter("/admin", admin.addMiddleware(auth));

export default {
  fetch: (request: Request, env: Env) => app.fetch(request, { env }),
};
