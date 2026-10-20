import type { ValidationErrors } from "./types";

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
  message: string;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.message = message;
  }

  response(): Response {
    return jsonResponse({ message: this.message }, { status: this.status });
  }
}

export class ValidationResponseError extends ResponseError {
  validationError: ValidationErrors;
  constructor(validationError: ValidationErrors) {
    super(422, "Validation Error");
    this.validationError = validationError;
  }

  response(): Response {
    return jsonResponse(this.validationError, { status: this.status });
  }
}
