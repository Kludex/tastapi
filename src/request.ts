import type { z } from "zod";
import { ResponseError } from "./responses.ts";
import type { ObjectSchema } from "./types.ts";

export interface ValidationIssue {
  type: string;
  loc: (string | number)[];
  msg: string;
}

export interface InputSchemas {
  path?: ObjectSchema | undefined;
  query?: ObjectSchema | undefined;
  headers?: ObjectSchema | undefined;
  cookies?: ObjectSchema | undefined;
  body?: z.ZodType | undefined;
}

export interface Inputs {
  path: unknown;
  query: unknown;
  headers: unknown;
  cookies: unknown;
  body: unknown;
}

export async function parseInputs(
  schemas: InputSchemas,
  request: Request,
  url: URL,
  params: Record<string, string>,
  maxBodySize: number,
): Promise<Inputs> {
  const issues: ValidationIssue[] = [];
  const validate = (source: keyof Inputs, schema: z.ZodType | undefined, data: unknown) => {
    if (schema === undefined) {
      return undefined;
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      issues.push(...result.error.issues.map((issue) => toValidationIssue(source, issue)));
    }
    return result.data;
  };

  const decoded = decodeParams(params, issues);
  const inputs: Inputs = {
    path: schemas.path && issues.length === 0 ? validate("path", schemas.path, decoded) : decoded,
    query: validate("query", schemas.query, schemas.query && queryObject(url, schemas.query)),
    headers: validate(
      "headers",
      schemas.headers,
      schemas.headers && headerObject(request, schemas.headers),
    ),
    cookies: validate("cookies", schemas.cookies, schemas.cookies && cookieObject(request)),
    body: undefined,
  };
  if (schemas.body) {
    const body = await readJSON(request, maxBodySize);
    if (!body.ok) {
      issues.push(body.issue);
    } else if (body.value === undefined && !schemas.body.safeParse(undefined).success) {
      issues.push({ type: "missing", loc: ["body"], msg: "Request body is required" });
    } else {
      inputs.body = validate("body", schemas.body, body.value);
    }
  }
  if (issues.length > 0) {
    throw new ResponseError(422, issues);
  }
  return inputs;
}

function toValidationIssue(source: string, issue: z.core.$ZodIssue): ValidationIssue {
  const loc = issue.path.map((part) => (typeof part === "number" ? part : String(part)));
  return { type: issue.code, loc: [source, ...loc], msg: issue.message };
}

function decodeParams(
  params: Record<string, string>,
  issues: ValidationIssue[],
): Record<string, string> {
  const decoded: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    try {
      decoded[name] = decodeURIComponent(value);
    } catch {
      issues.push({
        type: "invalid_encoding",
        loc: ["path", name],
        msg: "Invalid percent-encoding",
      });
    }
  }
  return decoded;
}

function queryObject(url: URL, schema: ObjectSchema): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const field = schema.shape[key];
    query[key] =
      field && isArraySchema(field)
        ? url.searchParams.getAll(key)
        : url.searchParams.getAll(key).at(-1)!;
  }
  return query;
}

function headerObject(request: Request, schema: ObjectSchema): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = request.headers.get(key);
    if (value !== null) {
      headers[key] = value;
    }
  }
  return headers;
}

function cookieObject(request: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
    const index = pair.indexOf("=");
    const name = (index === -1 ? "" : pair.slice(0, index)).trim();
    if (name !== "" && !(name in cookies)) {
      cookies[name] = safeDecode(
        pair
          .slice(index + 1)
          .trim()
          .replace(/^"(.*)"$/, "$1"),
      );
    }
  }
  return cookies;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isArraySchema(schema: z.ZodType): boolean {
  const def = schema._zod.def as { type: string; innerType?: z.ZodType; in?: z.ZodType };
  const inner = def.innerType ?? def.in;
  return def.type === "array" || (inner !== undefined && isArraySchema(inner));
}

type ReadResult = { ok: true; value: unknown } | { ok: false; issue: ValidationIssue };

async function readJSON(request: Request, maxBodySize: number): Promise<ReadResult> {
  const contentType = request.headers.get("content-type");
  if (contentType !== null && !isJSONContentType(contentType)) {
    throw new ResponseError(415, "Unsupported Media Type");
  }
  const text = await readText(request, maxBodySize);
  if (text === "") {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const msg = `Invalid JSON: ${(error as SyntaxError).message}`;
    return { ok: false, issue: { type: "json_invalid", loc: ["body"], msg } };
  }
}

function isJSONContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json" || /^application\/[^/]+\+json$/.test(mediaType);
}

async function readText(request: Request, limit: number): Promise<string> {
  if (request.body === null) {
    return "";
  }
  if (Number(request.headers.get("content-length")) > limit) {
    throw tooLarge();
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

function tooLarge(): ResponseError {
  return new ResponseError(413, "Request body too large");
}
