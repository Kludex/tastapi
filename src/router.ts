import type * as z from "zod";
import { createOpenApiDocument, type OpenAPIConfig, type OpenAPIDocument } from "./openapi.ts";
import { parseInputs, type Inputs } from "./request.ts";
import { InvalidResponseError, json, ResponseError, type ResponseOptions } from "./responses.ts";
import {
  allowHeader,
  checkPrefix,
  compilePath,
  matchPrefix,
  type CompiledPath,
} from "./routing.ts";
import {
  METHODS,
  type Method,
  type Middleware,
  type ResponseSchemas,
  type RouteHelper,
  type RouteOptions,
  type RoutesHelper,
} from "./types.ts";

export interface RouterOptions<O, I> {
  /** Serve an OpenAPI document. Applies to the router you call `fetch` on. */
  openApi?: OpenAPIConfig | undefined;
  /** Turn the outer state `O` into the inner state `I` seen by the routes. */
  middleware?: Middleware<O, I> | undefined;
  /** Called with unhandled errors and invalid responses. Defaults to `console.error`. */
  onError?: ((error: unknown) => void) | undefined;
  /** Largest accepted request body, in bytes. Defaults to 1 MiB. */
  maxBodySize?: number | undefined;
  includeInSchema?: boolean | undefined;
}

export interface Route {
  methods: readonly string[];
  path: string;
  compiled: CompiledPath;
  options: RouteOptions<
    z.ZodObject | undefined,
    z.ZodObject | undefined,
    z.ZodObject | undefined,
    z.ZodObject | undefined,
    z.ZodType | undefined,
    z.ZodType | undefined,
    ResponseSchemas,
    number
  >;
  status: number;
  responses: ResponseSchemas;
  handler: (args: Inputs & HandlerContext) => unknown;
}

interface HandlerContext {
  request: Request;
  url: URL;
  state: unknown;
  respond: (status: number, data?: unknown, init?: ResponseOptions) => Response;
}

interface Mount {
  prefix: string;
  router: AnyRouter;
  includeInSchema: boolean;
}

interface Resolved {
  route: Route;
  params: Record<string, string>;
  routers: AnyRouter[];
}

// oxlint-disable-next-line typescript/no-explicit-any -- mounted routers may have any state types
type AnyRouter = Router<any, any>;

const NO_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);
const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;

export class Router<O = undefined, I = O> {
  protected readonly entries: (Route | Mount)[] = [];
  protected readonly settings: RouterOptions<O, I>;
  protected document: OpenAPIDocument | undefined;

  constructor(options: RouterOptions<O, I> = {}) {
    this.settings = options;
  }

  get: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["GET"], path, rest);
  head: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["HEAD"], path, rest);
  post: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["POST"], path, rest);
  put: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["PUT"], path, rest);
  patch: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["PATCH"], path, rest);
  delete: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["DELETE"], path, rest);
  options: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(["OPTIONS"], path, rest);
  all: RouteHelper<I> = (path: string, ...rest: unknown[]) => this.add(METHODS, path, rest);
  route: RoutesHelper<I> = (methods: readonly Method[], path: string, ...rest: unknown[]) =>
    this.add(methods, path, rest);

  includeRouter<Inner>(
    prefix: string,
    router: Router<I, Inner>,
    options: { includeInSchema?: boolean } = {},
  ): void {
    checkPrefix(prefix);
    this.entries.push({ prefix, router, includeInSchema: options.includeInSchema ?? true });
  }

  addMiddleware<Outer>(middleware: Middleware<Outer, O>): Router<Outer, O> {
    const { openApi, onError, maxBodySize, includeInSchema } = this.settings;
    const router = new Router<Outer, O>({
      openApi,
      onError,
      maxBodySize,
      includeInSchema,
      middleware,
    });
    router.includeRouter("", this);
    return router;
  }

  async fetch(
    request: Request,
    ...[state]: undefined extends O ? [state?: O] : [state: O]
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.handle(request, new URL(request.url), state as O);
    } catch (error) {
      response = this.errorResponse(error);
    }
    return request.method === "HEAD" ? new Response(null, response) : response;
  }

  openApiDocument(): OpenAPIDocument {
    this.document ??= createOpenApiDocument(this.settings.openApi ?? {}, this.schemaRoutes());
    return this.document;
  }

  protected add(methods: readonly Method[], path: string, rest: unknown[]): void {
    const [options, handler] = (rest.length === 1 ? [{}, rest[0]] : rest) as [
      Route["options"],
      Route["handler"],
    ];
    const compiled = compilePath(path);
    if (options.path) {
      const keys = Object.keys(options.path.shape);
      if ([...keys].sort().join() !== [...compiled.params].sort().join()) {
        throw new Error(
          `Path parameters {${compiled.params.join(", ")}} in "${path}" do not match the path schema keys {${keys.join(", ")}}`,
        );
      }
    }
    const status = options.status ?? 200;
    const responses = {
      ...options.responses,
      ...(options.response && { [status]: options.response }),
    };
    this.entries.push({ methods, path, compiled, options, status, responses, handler });
  }

  // Every `return await` in this file attaches a handler before workerd reports a rejection as unhandled.
  protected async handle(request: Request, url: URL, state: O): Promise<Response> {
    const allowed = new Set<string>();
    const resolved =
      this.resolve(request.method, url.pathname, allowed) ??
      (request.method === "HEAD" ? this.resolve("GET", url.pathname, allowed) : undefined) ??
      this.resolveOpenApi(request.method, url.pathname, allowed);
    const maxBodySize = this.settings.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
    const endpoint = async (innerState: unknown): Promise<Response> => {
      if (resolved) {
        return await this.run(resolved, 0, { request, url, state: innerState }, maxBodySize);
      } else if (allowed.size === 0) {
        return json({ detail: "Not Found" }, { status: 404 });
      }
      const allow = allowHeader(allowed);
      return request.method === "OPTIONS"
        ? new Response(null, { status: 204, headers: { allow } })
        : json({ detail: "Method Not Allowed" }, { status: 405, headers: { allow } });
    };
    return await withMiddleware(this.settings.middleware, { request, url, state }, endpoint);
  }

  protected resolve(method: string, path: string, allowed: Set<string>): Resolved | undefined {
    for (const entry of this.entries) {
      if ("router" in entry) {
        const rest = matchPrefix(entry.prefix, path);
        const resolved =
          rest === undefined ? undefined : entry.router.resolve(method, rest, allowed);
        if (resolved) {
          resolved.routers.unshift(entry.router);
          return resolved;
        }
        continue;
      }
      const params = matchPath(entry, path);
      if (params === undefined) {
        continue;
      } else if (entry.methods.includes(method)) {
        return { route: entry, params, routers: [] };
      }
      for (const allowedMethod of entry.methods) {
        allowed.add(allowedMethod);
      }
    }
    return undefined;
  }

  protected resolveOpenApi(
    method: string,
    path: string,
    allowed: Set<string>,
  ): Resolved | undefined {
    const { openApi } = this.settings;
    if (openApi === undefined || path !== (openApi.path ?? "/openapi.json")) {
      return undefined;
    } else if (method !== "GET" && method !== "HEAD") {
      allowed.add("GET");
      return undefined;
    }
    const route: Route = {
      methods: ["GET"],
      path,
      compiled: { regex: undefined, params: [], convertors: [], openApiPath: path },
      options: {},
      status: 200,
      responses: {},
      handler: () => json(this.openApiDocument()),
    };
    return { route, params: {}, routers: [] };
  }

  protected schemaRoutes(prefix = ""): Route[] {
    if (this.settings.includeInSchema === false) {
      return [];
    }
    return this.entries.flatMap((entry) => {
      if ("router" in entry) {
        return entry.includeInSchema ? entry.router.schemaRoutes(prefix + entry.prefix) : [];
      }
      return entry.options.includeInSchema === false
        ? []
        : [
            {
              ...entry,
              path: prefix + entry.path,
              compiled: { ...entry.compiled, openApiPath: prefix + entry.compiled.openApiPath },
            },
          ];
    });
  }

  protected async run(
    resolved: Resolved,
    depth: number,
    context: { request: Request; url: URL; state: unknown },
    maxBodySize: number,
  ): Promise<Response> {
    const router = resolved.routers[depth];
    if (router) {
      return await withMiddleware(router.settings.middleware, context, (state) =>
        this.run(resolved, depth + 1, { ...context, state }, maxBodySize),
      );
    }
    const { route, params } = resolved;
    const inputs = await parseInputs(
      route.options,
      context.request,
      context.url,
      params,
      maxBodySize,
    );
    const respond = (status: number, data?: unknown, init?: ResponseOptions) =>
      serialize(route.responses[status], status, data, init);
    const result = await route.handler({ ...inputs, ...context, respond });
    return result instanceof Response ? result : respond(route.status, result);
  }

  protected errorResponse(error: unknown): Response {
    if (error instanceof ResponseError) {
      return error.response();
    }
    (this.settings.onError ?? console.error)(error);
    return json({ detail: "Internal Server Error" }, { status: 500 });
  }
}

async function withMiddleware<O>(
  middleware: Middleware<O, unknown> | undefined,
  context: { request: Request; url: URL; state: O },
  endpoint: (state: unknown) => Promise<Response>,
): Promise<Response> {
  const next = async (state: unknown) => {
    try {
      return await endpoint(state);
    } catch (error) {
      if (error instanceof ResponseError) {
        return error.response();
      }
      throw error;
    }
  };
  return await (middleware ? middleware(context, next) : next(context.state));
}

function serialize(
  schema: z.ZodType | undefined,
  status: number,
  data: unknown,
  init?: ResponseOptions,
): Response {
  let body = data;
  if (schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new InvalidResponseError(result.error.issues, data);
    }
    body = result.data;
  }
  if (NO_BODY_STATUSES.has(status)) {
    return new Response(null, { status, headers: init?.headers ?? {} });
  }
  return json(body === undefined ? null : body, { status, headers: init?.headers });
}

function matchPath(route: Route, path: string): Record<string, string> | undefined {
  if (route.compiled.regex === undefined) {
    return route.path === path ? {} : undefined;
  }
  const groups = route.compiled.regex.exec(path)?.groups;
  return groups && { ...groups };
}
