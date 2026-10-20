import { z } from "zod";

import type { Router } from "./index.ts";

export type Method = "OPTIONS" | "HEAD" | "GET" | "POST" | "PUT" | "DELETE";

export class ResponseInfo<R extends z.ZodType> {
  data: z.input<R>;
  headers: HeadersInit;

  constructor(data: z.input<R>, headers?: HeadersInit) {
    this.data = data;
    this.headers = headers ?? {};
  }
}

export type RouterHandler<
  P extends z.ZodObject | z.ZodNull,
  Q extends z.ZodObject | z.ZodNull,
  B extends z.ZodType,
  R extends z.ZodType,
  S,
> = (args: {
  path: z.infer<P>;
  query: z.infer<Q>;
  body: z.infer<B>;
  request: Request;
  state: S;
  _?: R | undefined;
}) => z.input<R> | ResponseInfo<R> | Promise<z.input<R> | ResponseInfo<R>>;

export interface PlainRoute<
  Q extends z.ZodObject | z.ZodNull,
  B extends z.ZodType,
  R extends z.ZodType,
  S,
> {
  path: string;
  method: Method;
  querySchema?: Q | undefined;
  bodySchema?: B | undefined;
  responseSchema?: R | undefined;
  includeInSchema: boolean;
  summary?: string | undefined;
  description?: string | undefined;
  handler: RouterHandler<z.ZodNull, Q, B, R, S>;
}

export interface PathParamsRoute<
  P extends z.ZodObject | z.ZodNull,
  Q extends z.ZodObject | z.ZodNull,
  B extends z.ZodType,
  R extends z.ZodType,
  S,
> {
  path: string;
  regex: RegExp;
  method: Method;
  pathSchema: P;
  querySchema?: Q | undefined;
  bodySchema?: B | undefined;
  responseSchema?: R | undefined;
  includeInSchema: boolean;
  summary?: string | undefined;
  description?: string | undefined;
  handler: RouterHandler<P, Q, B, R, S>;
}

export interface SubRouter<S> {
  routerPrefix: string;
  router: Router<S, unknown>;
  includeInSchema: boolean;
}

interface MatchPlainRoute<S> {
  type: "plain";
  // biome-ignore lint/suspicious/noExplicitAny: run time validation sets these types
  route: PlainRoute<any, any, any, S>;
}

interface MatchPathParamsRoute<S> {
  type: "pathparams";
  // biome-ignore lint/suspicious/noExplicitAny: run time validation sets these types
  route: PathParamsRoute<any, any, any, any, S>;
  regexMatch: RegExpMatchArray;
}

interface MatchSubRouter<S> {
  type: "subrouter";
  router: Router<S, unknown>;
  match: RouteMatch<unknown>;
}

interface MatchMethodNotAllowed {
  type: "method-not-allowed";
  allowedMethods: Method[];
}

interface MatchNotFound {
  type: "not-found";
}

export type RouteMatch<S> =
  | MatchPlainRoute<S>
  | MatchPathParamsRoute<S>
  | MatchSubRouter<S>
  | MatchMethodNotAllowed
  | MatchNotFound;

export interface DispatchInit<O, I> {
  request: Request;
  url: URL;
  state: O;
  match: RouteMatch<I>;
}

export type MiddlewareNext<O, I> = (init: DispatchInit<O, I>) => Promise<Response>;
export type Middleware<O, I> = (
  init: DispatchInit<O, I>,
  next: MiddlewareNext<I, I>,
) => Promise<Response>;

export type Route<
  P extends z.ZodObject | z.ZodNull,
  Q extends z.ZodObject | z.ZodNull,
  B extends z.ZodType,
  R extends z.ZodType,
  S,
> = PlainRoute<Q, B, R, S> | PathParamsRoute<P, Q, B, R, S> | SubRouter<S>;

// biome-ignore lint/suspicious/noExplicitAny: run time validation sets these types
export type AnyRoute<S> = Route<any, any, any, any, S>;

export const valErrorSchema = z.object({ path: z.string(), message: z.string() });

export interface ValError {
  path: string;
  message: string;
}

export const validationErrorsSchema = z.object({
  path: z.array(valErrorSchema).optional(),
  query: z.array(valErrorSchema).optional(),
  body: z.array(valErrorSchema).optional(),
});

export type ValidationErrors = z.infer<typeof validationErrorsSchema>;
