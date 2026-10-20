import type { z } from "zod";

export interface ResponseOptions {
  status?: number | undefined;
  headers?: HeadersInit | undefined;
}

export function json(data: unknown, options?: ResponseOptions): Response {
  return withContentType(JSON.stringify(data), "application/json", options);
}

export function text(body: string, options?: ResponseOptions): Response {
  return withContentType(body, "text/plain; charset=utf-8", options);
}

export function html(body: string, options?: ResponseOptions): Response {
  return withContentType(body, "text/html; charset=utf-8", options);
}

export function redirect(
  url: string | URL,
  status = 307,
  options?: Pick<ResponseOptions, "headers">,
): Response {
  const headers = new Headers(options?.headers);
  headers.set("location", String(url));
  return new Response(null, { status, headers });
}

export function stream(
  source: ReadableStream<Uint8Array> | AsyncIterable<string | Uint8Array>,
  options?: ResponseOptions,
): Response {
  const body = source instanceof ReadableStream ? source : iterableStream(source);
  return withContentType(body, "application/octet-stream", options);
}

export class ResponseError extends Error {
  status: number;
  detail: unknown;
  headers: HeadersInit | undefined;

  constructor(status: number, detail: unknown, options?: Pick<ResponseOptions, "headers">) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
    this.headers = options?.headers;
  }

  response(): Response {
    return json({ detail: this.detail }, { status: this.status, headers: this.headers });
  }
}

export class InvalidResponseError extends Error {
  issues: z.core.$ZodIssue[];
  data: unknown;

  constructor(issues: z.core.$ZodIssue[], data: unknown) {
    super("Response does not match the response schema");
    this.issues = issues;
    this.data = data;
  }
}

function withContentType(body: BodyInit, contentType: string, options?: ResponseOptions): Response {
  const headers = new Headers(options?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", contentType);
  }
  return new Response(body, { status: options?.status ?? 200, headers });
}

function iterableStream(source: AsyncIterable<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(typeof value === "string" ? encoder.encode(value) : value);
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}
