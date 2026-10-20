import type { z } from "zod";
import type { ValidationIssue } from "./types.ts";

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
  }: { pretty?: boolean; status?: number; headers?: HeadersInit } = {},
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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }

  response(): Response {
    return jsonResponse({ detail: this.message }, { status: this.status });
  }
}

export class ValidationResponseError extends ResponseError {
  issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(422, "Validation Error");
    this.issues = issues;
  }

  override response(): Response {
    return jsonResponse({ detail: this.issues }, { status: this.status });
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
