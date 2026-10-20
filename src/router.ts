import { z } from "zod";
import { createOpenApiType, DEFAULT_OPENAPI_URL, type OpenAPIConfig } from "./openApi.ts";
import * as types from "./types.ts";
import { InvalidResponseError, jsonResponse, ResponseError } from "./utils.ts";

// `S` stands for "outer request state"
// `I` stands for "inner (or internal) request state"

export class Router<O = null, I = O> {
  routes: types.AnyRoute<I>[] = [];
  protected openApiConfig?: OpenAPIConfig | undefined;
  protected middleware?: types.Middleware<O, I> | undefined;
  includeInSchema?: boolean | undefined;
  openApiRoute?: types.PlainRoute<never, never, z.ZodType, I> | undefined;
  onError: (error: unknown) => void;

  constructor(settings?: {
    openApiConfig?: OpenAPIConfig | undefined;
    includeInSchema?: boolean | undefined;
    middleware?: types.Middleware<O, I> | undefined;
    onError?: ((error: unknown) => void) | undefined;
  }) {
    this.onError = settings?.onError ?? console.error;
    this.openApiConfig = settings?.openApiConfig;
    this.includeInSchema = settings?.includeInSchema;
    this.middleware = settings?.middleware;
    if (this.openApiConfig) {
      this.openApiRoute = {
        path: this.openApiConfig.path ?? DEFAULT_OPENAPI_URL,
        method: "GET",
        includeInSchema: false,
        handler: () => {
          return this.openApiResponse();
        },
      };
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: inner state can be anything
  includeRouter(routerPrefix: string, router: Router<I, any>, includeInSchema?: boolean): void {
    this.routes.push({ routerPrefix, router, includeInSchema: includeInSchema ?? true });
  }

  addMiddleware<NewOuter>(middleware: types.Middleware<NewOuter, O>): Router<NewOuter, O> {
    const newRouter = new Router<NewOuter, O>({
      onError: this.onError,
      openApiConfig: this.openApiConfig,
      includeInSchema: this.includeInSchema,
      middleware,
    });
    newRouter.includeRouter("", this);
    return newRouter;
  }

  get: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("GET", path, schemas, handler);
  head: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("HEAD", path, schemas, handler);
  post: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("POST", path, schemas, handler);
  put: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("PUT", path, schemas, handler);
  patch: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("PATCH", path, schemas, handler);
  delete: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("DELETE", path, schemas, handler);
  options: types.MethodHelper<I> = (path, schemas, handler) =>
    this.route("OPTIONS", path, schemas, handler);

  route<
    P extends z.ZodObject | z.ZodNull = z.ZodNull,
    Q extends z.ZodObject | z.ZodNull = z.ZodNull,
    B extends z.ZodType = z.ZodNull,
    R extends z.ZodType = z.ZodAny,
  >(
    method: types.Method,
    path: string,
    schemas: types.RouteSchemas<P, Q, B, R>,
    handler: types.RouterHandler<P, Q, B, R, I>,
  ): types.Route<P, Q, B, R, I> {
    let route: types.Route<P, Q, B, R, I>;
    const {
      pathSchema,
      querySchema,
      bodySchema,
      responseSchema,
      includeInSchema,
      summary,
      description,
    } = schemas;
    if (pathSchema) {
      route = {
        path,
        regex: buildPathRegex(path),
        method,
        pathSchema,
        querySchema,
        bodySchema,
        responseSchema,
        includeInSchema: includeInSchema ?? true,
        summary,
        description,
        handler,
      };
    } else {
      route = {
        path,
        method,
        querySchema,
        bodySchema,
        responseSchema,
        includeInSchema: includeInSchema ?? true,
        summary,
        description,
        handler: handler as types.RouterHandler<z.ZodNull, Q, B, R, I>,
      };
    }
    this.routes.push(route);
    return route;
  }

  async fetch(request: Request, state?: O): Promise<Response> {
    const url = new URL(request.url);
    let match = this.matchRoute(request.method, url.pathname);
    if (request.method !== "HEAD") {
      return this.dispatch({ request, url, state: state as O }, match);
    }
    if (match.type === "not-found" || match.type === "method-not-allowed") {
      const getMatch = this.matchRoute("GET", url.pathname);
      if (getMatch.type !== "not-found" && getMatch.type !== "method-not-allowed") {
        match = getMatch;
      }
    }
    const response = await this.dispatch({ request, url, state: state as O }, match);
    return new Response(null, response);
  }

  protected async dispatch(
    { request, url, state }: Omit<types.DispatchInit<O, I>, "match">,
    match: types.RouteMatch<I>,
  ): Promise<Response> {
    const init = { request, url, state, match };
    try {
      if (this.middleware) {
        return await this.middleware(init, this.dispatchEndpoint.bind(this));
      } else {
        return await this.dispatchEndpoint(init as unknown as types.DispatchInit<I, I>);
      }
    } catch (error) {
      if (error instanceof ResponseError) {
        return error.response();
      } else {
        throw error;
      }
    }
  }

  protected async dispatchEndpoint(init: types.DispatchInit<I, I>): Promise<Response> {
    const { match, ...rest } = init;
    switch (match.type) {
      case "plain":
        return await this.dispatchPlainRoute(match.route, init);
      case "pathparams":
        return await this.dispatchParamsRoute(match.route, match.regexMatch, init);
      case "subrouter":
        return await match.router.dispatch(rest, match.match);
      case "method-not-allowed":
        return init.request.method === "OPTIONS"
          ? new Response(null, {
              status: 204,
              headers: { allow: allowHeader(match.allowedMethods) },
            })
          : this.onMethodNotAllowed(match.allowedMethods);
      case "not-found":
        return this.onNotFound();
    }
  }

  protected matchRoute(method: string, path: string): types.RouteMatch<I> {
    // used to return 405 when a path matched, so we can try multiple paths
    const allowedMethods: types.Method[] = [];

    const routes: types.AnyRoute<I>[] = this.openApiRoute
      ? [...this.routes, this.openApiRoute]
      : this.routes;

    for (const route of routes) {
      if ("routerPrefix" in route) {
        const subPath = path.slice(route.routerPrefix.length);
        if (path.startsWith(route.routerPrefix) && (subPath === "" || subPath.startsWith("/"))) {
          const match = route.router.matchRoute(method, subPath);
          if (match.type === "method-not-allowed") {
            allowedMethods.push(...match.allowedMethods);
          } else if (match.type !== "not-found") {
            return { type: "subrouter", match, router: route.router };
          }
        }
      } else if ("regex" in route) {
        const regexMatch = path.match(route.regex);
        if (regexMatch) {
          if (route.method === method) {
            return { type: "pathparams", route, regexMatch };
          } else {
            allowedMethods.push(route.method);
          }
        }
      } else if (route.path === path) {
        if (route.method === method) {
          return { type: "plain", route };
        } else {
          allowedMethods.push(route.method);
        }
      }
    }
    if (allowedMethods.length) {
      return { type: "method-not-allowed", allowedMethods };
    } else {
      return { type: "not-found" };
    }
  }

  protected async dispatchPlainRoute<
    Q extends z.ZodObject | z.ZodNull,
    B extends z.ZodType,
    R extends z.ZodType,
  >(
    route: types.PlainRoute<Q, B, R, I>,
    { request, url, state }: types.DispatchInit<I, I>,
  ): Promise<Response> {
    const { querySchema, bodySchema, responseSchema } = route;
    const requestData = await this.validateRequest(
      undefined,
      querySchema,
      bodySchema,
      undefined,
      url,
      request,
    );
    if ("errors" in requestData) {
      return this.onInvalidRequest(requestData.errors);
    } else {
      const { query, body } = requestData;
      const responeData = await route.handler({
        path: null,
        query,
        body,
        request,
        state,
      });
      return this.validateResponse(responseSchema, responeData);
    }
  }

  protected async dispatchParamsRoute<
    P extends z.ZodObject | z.ZodNull,
    Q extends z.ZodObject | z.ZodNull,
    B extends z.ZodType,
    R extends z.ZodType,
  >(
    route: types.PathParamsRoute<P, Q, B, R, I>,
    match: RegExpMatchArray,
    { request, url, state }: types.DispatchInit<I, I>,
  ): Promise<Response> {
    const { pathSchema, querySchema, bodySchema, responseSchema } = route;
    const requestData = await this.validateRequest(
      pathSchema,
      querySchema,
      bodySchema,
      match,
      url,
      request,
    );

    if ("errors" in requestData) {
      return this.onInvalidRequest(requestData.errors);
    } else {
      const { path, query, body } = requestData;
      const responeData = await route.handler({ path, query, body, request, state });
      return this.validateResponse(responseSchema, responeData);
    }
  }

  protected async validateRequest<
    P extends z.ZodObject | z.ZodNull,
    Q extends z.ZodObject | z.ZodNull,
    B extends z.ZodType,
  >(
    pathSchema: P | undefined,
    querySchema: Q | undefined,
    bodySchema: B | undefined,
    match: RegExpMatchArray | undefined,
    url: URL,
    request: Request,
  ): Promise<
    { path: z.infer<P>; query: z.infer<Q>; body: z.infer<B> } | { errors: types.ValidationErrors }
  > {
    const errors: types.ValidationErrors = {};
    let path: z.infer<P> = null as z.infer<P>;
    if (pathSchema) {
      const r = pathSchema.safeParse(match!.groups);
      if (r.success) {
        path = r.data as z.infer<P>;
      } else {
        errors.path = r.error.issues.map(mapValError);
      }
    }
    let query: z.infer<Q> = null as z.infer<Q>;
    if (querySchema) {
      const r = querySchema.safeParse(getQueryObject(url));
      if (r.success) {
        query = r.data as z.infer<Q>;
      } else {
        errors.query = r.error.issues.map(mapValError);
      }
    }
    let body: z.infer<B> = null as z.infer<B>;
    if (bodySchema) {
      const contentType = request.headers.get("content-type");
      if (contentType !== null && !isJSONContentType(contentType)) {
        throw new ResponseError(415, "Unsupported Media Type");
      }
      const text = await request.text();
      let bodyData: unknown;
      if (text === "") {
        if (!bodySchema.safeParse(undefined).success) {
          errors.body = [{ path: "root", message: "Request body is required" }];
          return { errors };
        }
      } else {
        try {
          bodyData = JSON.parse(text);
        } catch (error) {
          errors.body = [
            { path: "root", message: `Invalid JSON: ${(error as SyntaxError).message}` },
          ];
          return { errors };
        }
      }
      const r = bodySchema.safeParse(bodyData);
      if (r.success) {
        body = r.data;
      } else {
        errors.body = r.error.issues.map(mapValError);
      }
    }
    if (Object.keys(errors).length > 0) {
      return { errors };
    } else {
      return { path, query, body };
    }
  }

  protected validateResponse<R extends z.ZodType>(
    responseSchema: R | undefined,
    data: z.input<R> | types.ResponseInfo<R> | Response,
  ): Response {
    let headers: HeadersInit = {};
    if (data instanceof types.ResponseInfo) {
      headers = data.headers;
      data = data.data;
    }

    if (data instanceof Response) {
      return data;
    } else if (!responseSchema) {
      return this.onSuccess(200, data, headers);
    }

    const r = responseSchema.safeParse(data);
    if (r.success) {
      return this.onSuccess(...extractResponse(responseSchema, r.data), headers);
    } else {
      return this.onInvalidResponse(r.error.issues, data);
    }
  }

  protected openApiResponse() {
    if (this.openApiConfig) {
      const doc = createOpenApiType(this.openApiConfig, this.routes);
      return jsonResponse(doc, { pretty: true });
    } else {
      // shouldn't happen, but we include this for completeness
      return this.onNotFound();
    }
  }

  protected onSuccess(status: number, data: unknown, headers: HeadersInit): Response {
    if (data instanceof Response) {
      return data;
    } else if (typeof data === "undefined") {
      return jsonResponse("OK", { status, headers });
    } else {
      return jsonResponse(data, { status, headers });
    }
  }

  protected onInvalidRequest(errors: types.ValidationErrors): Response {
    return jsonResponse(errors, { status: 422 });
  }

  protected onInvalidResponse<R extends z.ZodType>(
    validationErrors: z.core.$ZodIssue[],
    responseData: z.input<R>,
  ): Response {
    this.onError(new InvalidResponseError(validationErrors, responseData));
    // return JSON even here since openapi-fetch expects a JSON response always (or fix in openApi.ts)
    return jsonResponse("500: Internal Server Error", { status: 500 });
  }

  protected onNotFound(): Response {
    return jsonResponse("404: Page not found", { status: 404 });
  }

  protected onMethodNotAllowed(allowedMethods: types.Method[]): Response {
    const allow = allowHeader(allowedMethods);
    return jsonResponse(`405: Method not allowed, Allowed: ${allow}`, {
      status: 405,
      headers: { allow },
    });
  }
}

function isJSONContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json" || /^application\/[^/]+\+json$/.test(mediaType);
}

function allowHeader(methods: types.Method[]): string {
  const allowed = new Set(methods);
  if (allowed.has("GET")) {
    allowed.add("HEAD");
  }
  allowed.add("OPTIONS");
  return [...allowed].join(", ");
}

function mapValError(error: z.core.$ZodIssue): types.ValError {
  return { path: error.path.join("."), message: error.message };
}

function buildPathRegex(path: string): RegExp {
  const regex = path.replace(/{(.+?)}/g, (_: string, args: string) => {
    const [param, type] = args.split(":");
    switch (type?.toLowerCase()) {
      case undefined:
      case "slug":
        return `(?<${param}>[^\\/]+)`;
      case "int":
        return `(?<${param}>\\d+)`;
      case "uuid":
        return `(?<${param}>[0-9a-f-]{36})`;
      case "path":
        return `(?<${param}>.+?)`;
      default:
        return `(?<${param}>${type})`;
    }
  });
  return new RegExp(`^${regex}$`);
}

function getQueryObject(url: URL): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of url.searchParams.entries()) {
    const current = result[key];
    if (typeof current !== "undefined") {
      if (Array.isArray(current)) {
        current.push(value);
      } else {
        result[key] = [current, value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// extract the response data in the case that the response scheme is a union used to indicate multiple possible response types
function extractResponse<Z extends z.ZodType>(schema: Z, data: z.output<Z>): [number, unknown] {
  if (!(schema instanceof z.ZodUnion)) {
    // not a union schema, return the default data
    return [200, data];
  }
  for (const option of schema.options) {
    if (option instanceof z.ZodObject) {
      const keys = Object.keys(option.shape);
      if (keys.length === 1) {
        const key = keys[0]!;
        if (/^[2-5]\d\d$/.test(key)) {
          const value = (data as Record<string, unknown>)[key];
          if (value !== undefined) {
            return [Number(key), value];
          }
          // so far the union is valid, but this wasn't the correct response code, keep looking
          continue;
        }
      }
    }
    // one member of the union not in the form {<response-code>: <schema>}, return the default data
    return [200, data];
  }
  return [200, data];
}
