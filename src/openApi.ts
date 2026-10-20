import { z } from "zod";
import * as types from "./types.ts";

export const DEFAULT_OPENAPI_URL = "/openapi.json";

export interface OpenAPIConfig {
  title?: string;
  description?: string;
  version?: string;
  path?: string;
}

const VALIDATION_ERROR_SCHEMA = toJSONSchema(
  z.object({ detail: z.array(types.validationIssueSchema) }),
);

export function createOpenApiType<
  P extends z.ZodObject | z.ZodNull,
  Q extends z.ZodObject | z.ZodNull,
  B extends z.ZodType,
  R extends z.ZodType,
  S,
>(config: OpenAPIConfig, routes: types.Route<P, Q, B, R, S>[]): OpenAPIDocument {
  const paths: Record<string, PathItem> = {};
  for (const { path, method, operation } of openAPIOperations(routes)) {
    const pathObject: PathItem | undefined = paths[path];
    if (pathObject) {
      // biome-ignore lint/suspicious/noExplicitAny: surely it should be possible to type this correctly?
      (pathObject as any)[method] = operation;
    } else {
      paths[path] = { [method]: operation };
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: config.title ?? "Untitled API",
      description: config.description,
      version: config.version ?? "0.0.0",
    },
    paths,
  };
}

interface PathOperation {
  path: string;
  method: HTTPMethod;
  operation: Operation;
}

function openAPIOperations<
  P extends z.ZodObject | z.ZodNull,
  Q extends z.ZodObject | z.ZodNull,
  B extends z.ZodType,
  R extends z.ZodType,
  S,
>(routes: types.Route<P, Q, B, R, S>[], prefix = ""): PathOperation[] {
  const operations: PathOperation[] = [];
  for (const route of routes) {
    if (!route.includeInSchema) {
      continue;
    }
    if ("path" in route) {
      const operation: Operation = {
        summary: route.summary,
        description: route.description,
        responses: {},
        // TODO could add `tags` here?
      };
      let validates = false;

      if ("pathSchema" in route && route.pathSchema instanceof z.ZodObject) {
        operation.parameters = Object.keys(route.pathSchema.shape).map((name) => ({
          name,
          in: "path",
          required: true,
        }));
        validates = true;
      }

      if (route.querySchema && route.querySchema instanceof z.ZodObject) {
        const parameters = operation.parameters ?? [];
        operation.parameters = parameters.concat(
          Object.entries(route.querySchema.shape).map(([name, schema]) => ({
            name,
            in: "query",
            required: !schema.isOptional(),
          })),
        );
        validates = true;
      }

      if (route.bodySchema) {
        operation.requestBody = {
          content: { "application/json": { schema: toJSONSchema(route.bodySchema) } },
        };
        validates = true;
      }
      operation.responses = {};
      if (route.responseSchema) {
        const responseCodeSchemas = getResponseSchemas(route.responseSchema);
        for (const [code, schema] of responseCodeSchemas) {
          operation.responses[code] = {
            description: `${code} Response`,
            content: { "application/json": { schema: toJSONSchema(schema) } },
          };
        }
      } else {
        operation.responses[200] = {
          description: "200 Response",
          content: { "application/json": { schema: toJSONSchema(z.literal("OK")) } },
        };
      }
      if (validates) {
        operation.responses["422"] = {
          description: "422 Response",
          content: {
            "application/json": { schema: VALIDATION_ERROR_SCHEMA },
          },
        };
      }
      const path = (prefix + route.path).replace(/{(.+?):.+?}/g, "{$1}");
      operations.push({
        path,
        method: route.method.toLowerCase() as HTTPMethod,
        operation,
      });
    } else if (route.router.includeInSchema ?? true) {
      operations.push(...openAPIOperations(route.router.routes, prefix + route.routerPrefix));
    }
  }
  return operations;
}

function toJSONSchema(zodSchema: z.ZodType): JSONSchema {
  const schema = z.toJSONSchema(zodSchema);
  delete schema.$schema;
  return schema as JSONSchema;
}

function getResponseSchemas(schema: z.ZodType): [string, z.ZodType][] {
  if (!(schema instanceof z.ZodUnion)) {
    // not a union schema, return the default case
    return [["200", schema]];
  }
  const responseSchemas: [string, z.ZodType][] = [];
  for (const option of schema.options) {
    if (option instanceof z.ZodObject) {
      const keys = Object.keys(option.shape);
      if (keys.length === 1) {
        const key = keys[0]!;
        if (/^[2-5]\d\d$/.test(key)) {
          responseSchemas.push([key, option.shape[key] as z.ZodType]);
          continue;
        }
      }
    }
    // one member of the union not in the form {<response-code>: <schema>}, return the default case
    return [["200", schema]];
  }
  return responseSchemas;
}

type JSONSchema = Record<string, unknown>;
type HTTPMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";
type PathItem = Partial<Record<HTTPMethod, Operation>>;

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: JSONSchema;
}

interface MediaContent {
  content: Record<string, { schema: JSONSchema }>;
}

interface Operation {
  summary?: string | undefined;
  description?: string | undefined;
  parameters?: Parameter[];
  requestBody?: MediaContent;
  responses: Record<string, MediaContent & { description: string }>;
}

export interface OpenAPIDocument {
  openapi: "3.1.0";
  info: { title: string; description?: string | undefined; version: string };
  paths: Record<string, PathItem>;
}
