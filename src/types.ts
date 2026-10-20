import type * as z from "zod";

export type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export const METHODS: readonly Method[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

export type ObjectSchema = z.ZodObject;
export type ResponseSchemas = { [status: number]: z.ZodType };
export type EmptyResponses = Record<never, never>;

export interface RouteDocs {
  summary?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  operationId?: string | undefined;
  deprecated?: boolean | undefined;
  security?: Record<string, string[]>[] | undefined;
  includeInSchema?: boolean | undefined;
}

export interface RouteOptions<
  P extends ObjectSchema | undefined = undefined,
  Q extends ObjectSchema | undefined = undefined,
  H extends ObjectSchema | undefined = undefined,
  C extends ObjectSchema | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType | undefined = undefined,
  RS extends ResponseSchemas = EmptyResponses,
  St extends number = 200,
> extends RouteDocs {
  path?: P;
  query?: Q;
  headers?: H;
  cookies?: C;
  body?: B;
  response?: R;
  responses?: RS;
  status?: St;
}

export type PathParams<T extends string> = string extends T
  ? Record<string, string>
  : { [K in PathParamNames<T>]: string };

type PathParamNames<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
  ? (Param extends `${infer Name}:${string}` ? Name : Param) | PathParamNames<Rest>
  : never;

type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

export type ResponseMap<
  R extends z.ZodType | undefined,
  RS extends ResponseSchemas,
  St extends number,
> = R extends z.ZodType ? Omit<RS, St> & { [K in St]: R } : RS;

export interface ResponseInit {
  headers?: HeadersInit | undefined;
}

export type Respond<M> = [keyof M] extends [never]
  ? (status: number, data?: unknown, init?: ResponseInit) => Response
  : <K extends keyof M & number>(
      status: K,
      data: M[K] extends z.ZodType ? z.input<M[K]> : never,
      init?: ResponseInit,
    ) => Response;

export interface HandlerArgs<
  T extends string,
  P extends ObjectSchema | undefined,
  Q extends ObjectSchema | undefined,
  H extends ObjectSchema | undefined,
  C extends ObjectSchema | undefined,
  B extends z.ZodType | undefined,
  M,
  S,
> {
  path: P extends z.ZodType ? z.output<P> : PathParams<T>;
  query: Output<Q>;
  headers: Output<H>;
  cookies: Output<C>;
  body: Output<B>;
  request: Request;
  url: URL;
  state: S;
  respond: Respond<M>;
}

export type HandlerResult<R extends z.ZodType | undefined> =
  | (R extends z.ZodType ? z.input<R> : unknown)
  | Response;

export type Handler<
  T extends string,
  P extends ObjectSchema | undefined,
  Q extends ObjectSchema | undefined,
  H extends ObjectSchema | undefined,
  C extends ObjectSchema | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType | undefined,
  RS extends ResponseSchemas,
  St extends number,
  S,
> = (
  args: HandlerArgs<T, P, Q, H, C, B, ResponseMap<R, RS, St>, S>,
) => HandlerResult<R> | Promise<HandlerResult<R>>;

export interface RouteHelper<S> {
  <T extends string>(path: T, handler: SimpleHandler<T, S>): void;
  <
    T extends string,
    P extends ObjectSchema | undefined = undefined,
    Q extends ObjectSchema | undefined = undefined,
    H extends ObjectSchema | undefined = undefined,
    C extends ObjectSchema | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends z.ZodType | undefined = undefined,
    RS extends ResponseSchemas = EmptyResponses,
    St extends number = 200,
  >(
    path: T,
    options: RouteOptions<P, Q, H, C, B, R, RS, St>,
    handler: Handler<T, P, Q, H, C, B, R, RS, St, S>,
  ): void;
}

export interface RoutesHelper<S> {
  <T extends string>(methods: readonly Method[], path: T, handler: SimpleHandler<T, S>): void;
  <
    T extends string,
    P extends ObjectSchema | undefined = undefined,
    Q extends ObjectSchema | undefined = undefined,
    H extends ObjectSchema | undefined = undefined,
    C extends ObjectSchema | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends z.ZodType | undefined = undefined,
    RS extends ResponseSchemas = EmptyResponses,
    St extends number = 200,
  >(
    methods: readonly Method[],
    path: T,
    options: RouteOptions<P, Q, H, C, B, R, RS, St>,
    handler: Handler<T, P, Q, H, C, B, R, RS, St, S>,
  ): void;
}

type SimpleHandler<T extends string, S> = Handler<
  T,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  EmptyResponses,
  200,
  S
>;

export interface Context<S> {
  request: Request;
  url: URL;
  state: S;
}

export type Next<S> = (state: S) => Promise<Response>;

export type Middleware<O, I> = (context: Context<O>, next: Next<I>) => Response | Promise<Response>;
