import * as z from "zod";
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

export type JSONSchema = { [key: string]: unknown };

export interface OpenAPIDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, JSONSchema>; securitySchemes?: Record<string, JSONSchema> };
}

interface Operation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  security?: Record<string, string[]>[];
  parameters?: Parameter[];
  requestBody?: { required: boolean; content: Content };
  responses: Record<string, { description: string; content?: Content }>;
}

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: JSONSchema;
}

type Content = Record<string, { schema: JSONSchema }>;
type IO = "input" | "output";

const NO_BODY_STATUSES = new Set([204, 205, 304]);
const VALIDATION_ERROR = z
  .object({
    detail: z.array(
      z
        .object({
          type: z.string(),
          loc: z.array(z.union([z.string(), z.number()])),
          msg: z.string(),
        })
        .meta({ id: "ValidationError" }),
    ),
  })
  .meta({ id: "HTTPValidationError" });

export function createOpenApiDocument(config: OpenAPIConfig, routes: Route[]): OpenAPIDocument {
  const schemas = new SchemaCollector();
  const operationIds = new Set<string>();
  const paths: OpenAPIDocument["paths"] = {};
  for (const route of routes) {
    for (const method of route.methods) {
      const item = (paths[route.compiled.openApiPath] ??= {});
      item[method.toLowerCase()] = operation(route, method, schemas, operationIds);
    }
  }
  const components: OpenAPIDocument["components"] = { schemas: schemas.components() };
  if (config.securitySchemes) {
    components.securitySchemes = config.securitySchemes;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: config.title ?? "API",
      version: config.version ?? "0.1.0",
      ...(config.description !== undefined && { description: config.description }),
    },
    ...(config.servers && { servers: config.servers }),
    paths,
    components,
  };
}

function operation(
  route: Route,
  method: string,
  schemas: SchemaCollector,
  operationIds: Set<string>,
): Operation {
  const { options } = route;
  const result: Omit<Operation, "responses"> = {
    ...(options.tags && { tags: options.tags }),
    ...(options.summary !== undefined && { summary: options.summary }),
    ...(options.description !== undefined && { description: options.description }),
    operationId: uniqueId(
      options.operationId ?? defaultOperationId(method, route.path),
      operationIds,
    ),
    ...(options.deprecated && { deprecated: true }),
    ...(options.security && { security: options.security }),
  };
  const parameters = [
    ...pathParameters(route, schemas),
    ...objectParameters("query", options.query, schemas),
    ...objectParameters("header", options.headers, schemas),
    ...objectParameters("cookie", options.cookies, schemas),
  ];
  if (parameters.length > 0) {
    result.parameters = parameters;
  }
  if (options.body) {
    result.requestBody = {
      required: !options.body.safeParse(undefined).success,
      content: { "application/json": { schema: schemas.add(options.body, "input") } },
    };
  }
  const responses: Operation["responses"] = {};
  for (const [status, schema] of Object.entries(route.responses)) {
    responses[status] = response(Number(status), schemas.add(schema, "output"));
  }
  responses[route.status] ??= response(route.status, {});
  if (parameters.length > 0 || options.body) {
    responses["422"] ??= response(422, schemas.add(VALIDATION_ERROR, "output"));
  }
  return { ...result, responses };
}

function response(status: number, schema: JSONSchema): { description: string; content?: Content } {
  const description = STATUS_DESCRIPTIONS[status] ?? "Response";
  return NO_BODY_STATUSES.has(status)
    ? { description }
    : { description, content: { "application/json": { schema } } };
}

function pathParameters(route: Route, schemas: SchemaCollector): Parameter[] {
  if (route.options.path) {
    return objectParameters("path", route.options.path, schemas);
  }
  return route.compiled.params.map((name, index) => ({
    name,
    in: "path",
    required: true,
    schema: convertorSchema(route.compiled.convertors[index]!),
  }));
}

function convertorSchema(convertor: string): JSONSchema {
  switch (convertor) {
    case "int":
      return { type: "integer", minimum: 0 };
    case "float":
      return { type: "number", minimum: 0 };
    case "uuid":
      return { type: "string", format: "uuid" };
    case "str":
    case "path":
      return { type: "string" };
    default:
      return { type: "string", pattern: `^${convertor}$` };
  }
}

function objectParameters(
  location: Parameter["in"],
  schema: z.ZodObject | undefined,
  schemas: SchemaCollector,
): Parameter[] {
  if (schema === undefined) {
    return [];
  }
  const { properties = {}, required = [] } = schemas.add(schema, "input", false) as {
    properties?: Record<string, JSONSchema>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.includes(name),
    schema: property,
  }));
}

function defaultOperationId(method: string, path: string): string {
  const words = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const param = /^{([^:}]+)/.exec(segment)?.[1];
      return param === undefined ? pascalCase(segment) : `By${pascalCase(param)}`;
    });
  return method.toLowerCase() + (words.join("") || "Root");
}

function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function uniqueId(id: string, used: Set<string>): string {
  let unique = id;
  for (let index = 2; used.has(unique); index++) {
    unique = `${id}${index}`;
  }
  used.add(unique);
  return unique;
}

/** Converts zod schemas to JSON Schema, moving named schemas into `components.schemas`. */
class SchemaCollector {
  private readonly defs = new Map<string, Partial<Record<IO, JSONSchema>>>();
  private readonly pending: { schema: JSONSchema; io: IO }[] = [];
  private anonymous = 0;

  add(zodSchema: z.ZodType, io: IO, allowRootRef = true): JSONSchema {
    const {
      $schema: _,
      $defs = {},
      ...schema
    } = z.toJSONSchema(zodSchema, {
      io,
      unrepresentable: "any",
    }) as JSONSchema & { $defs?: Record<string, JSONSchema> };
    for (const [name, def] of Object.entries($defs)) {
      this.define(name, io, def);
    }
    let root: JSONSchema = schema;
    if (allowRootRef && JSON.stringify(schema).includes('"$ref":"#"')) {
      const name = `Schema${++this.anonymous}`;
      this.define(name, io, schema);
      root = { $ref: `#/$defs/${name}` };
    }
    this.pending.push({ schema: root, io });
    return root;
  }

  components(): Record<string, JSONSchema> {
    const names = new Map<string, string>();
    const components: Record<string, JSONSchema> = {};
    for (const [name, { input, output }] of [...this.defs].sort(([a], [b]) => a.localeCompare(b))) {
      if (input && output && JSON.stringify(input) !== JSON.stringify(output)) {
        components[`${name}-Input`] = input;
        components[`${name}-Output`] = output;
        names.set(`input:${name}`, `${name}-Input`);
        names.set(`output:${name}`, `${name}-Output`);
      } else {
        components[name] = (input ?? output)!;
        names.set(`input:${name}`, name);
        names.set(`output:${name}`, name);
      }
    }
    const rewrite = (value: unknown, io: IO, rootName?: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item) => rewrite(item, io, rootName));
      } else if (typeof value === "object" && value !== null) {
        const object = value as JSONSchema;
        if (typeof object.$ref === "string") {
          const name = object.$ref === "#" ? rootName : object.$ref.slice("#/$defs/".length);
          object.$ref = `#/components/schemas/${names.get(`${io}:${name}`)}`;
        }
        Object.values(object).forEach((item) => rewrite(item, io, rootName));
      }
    };
    for (const [name, versions] of this.defs) {
      for (const io of ["input", "output"] as const) {
        const version = versions[io];
        if (version) {
          rewrite(version, io, name);
        }
      }
    }
    for (const { schema, io } of this.pending) {
      rewrite(schema, io);
    }
    return components;
  }

  private define(name: string, io: IO, schema: JSONSchema): void {
    const versions = this.defs.get(name) ?? {};
    versions[io] ??= schema;
    this.defs.set(name, versions);
  }
}

const STATUS_DESCRIPTIONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Validation Error",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};
