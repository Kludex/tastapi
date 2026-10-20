import type { z } from "zod";

export function ctHeader(contentType: string) {
  return { "Content-Type": contentType };
}

export function textResponse(
  message: string,
  { status = 200, headers }: { status?: number; headers?: HeadersInit } = {},
) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "text/plain");
  }
  return new Response(message, { status, headers: responseHeaders });
}

export function jsonResponse(
  data: unknown,
  {
    pretty = false,
    status = 200,
    headers,
  }: { pretty?: boolean; status?: number; headers?: HeadersInit | undefined } = {},
) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(data, null, pretty ? 2 : 0) + "\n", {
    headers: responseHeaders,
    status,
  });
}

export class ResponseError extends Error {
  status: number;
  detail: unknown;
  headers: HeadersInit | undefined;

  constructor(status: number, detail: unknown, init?: { headers?: HeadersInit }) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
    this.headers = init?.headers;
  }

  response(): Response {
    return jsonResponse({ detail: this.detail }, { status: this.status, headers: this.headers });
  }
}

export class InvalidResponseError extends Error {
  issues: z.core.$ZodIssue[];
  data: unknown;

  constructor(issues: z.core.$ZodIssue[], data: unknown) {
    super("Invalid response");
    this.issues = issues;
    this.data = data;
  }
}
