import { z } from "zod";
import type { Route } from "./router.ts";

export interface OpenAPIConfig {
  title?: string | undefined;
  version?: string | undefined;
  description?: string | undefined;
  /** Where the document is served. Defaults to `/openapi.json`. */
  path?: string | undefined;
  servers?: { url: string; description?: string }[] | undefined;
  securitySchemes?: Record<string, JSONSchema> | undefined;
}

export type JSONSchema = Record<string, unknown>;

export interface OpenAPIDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, Operation>>;
}

interface Operation {
  summary?: string;
  description?: string;
  parameters?: { name: string; in: string; required: boolean; schema: JSONSchema }[];
  requestBody?: { required: boolean; content: Record<string, { schema: JSONSchema }> };
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JSONSchema }> }
  >;
}

export function createOpenApiDocument(config: OpenAPIConfig, routes: Route[]): OpenAPIDocument {
  const paths: OpenAPIDocument["paths"] = {};
  for (const route of routes) {
    const path = route.path.replace(/{([^:}]+)(?::[^}]*)?}/g, "{$1}");
    for (const method of route.methods) {
      (paths[path] ??= {})[method.toLowerCase()] = operation(route);
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: config.title ?? "API",
      version: config.version ?? "0.1.0",
      ...(config.description && { description: config.description }),
    },
    paths,
  };
}

function operation(route: Route): Operation {
  const { options } = route;
  const result: Operation = { responses: {} };
  if (options.summary) result.summary = options.summary;
  if (options.description) result.description = options.description;
  if (options.body) {
    result.requestBody = {
      required: !options.body.safeParse(undefined).success,
      content: { "application/json": { schema: toJSONSchema(options.body) } },
    };
  }
  for (const [status, schema] of Object.entries(route.responses)) {
    result.responses[status] = {
      description: "Successful Response",
      content: { "application/json": { schema: toJSONSchema(schema) } },
    };
  }
  if (Object.keys(result.responses).length === 0) {
    result.responses[route.status] = { description: "Successful Response" };
  }
  return result;
}

function toJSONSchema(schema: z.ZodType): JSONSchema {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, { unrepresentable: "any" });
  return jsonSchema;
}
