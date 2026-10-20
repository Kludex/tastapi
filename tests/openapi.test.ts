import { Validator } from "@seriousme/openapi-schema-validator";
import { Router, swagger, type OpenAPIDocument } from "tastapi";
import { describe, expect, test } from "vitest";
import { z } from "zod";

async function expectValid(document: OpenAPIDocument) {
  const result = await new Validator().validate(structuredClone(document) as never);
  expect(result.errors).toBeUndefined();
  expect(result.valid).toBe(true);
}

function realisticApp() {
  const Address = z
    .object({ city: z.string(), country: z.string().length(2) })
    .meta({ id: "Address" });
  const User = z
    .object({
      id: z.number().int(),
      name: z.string(),
      role: z.enum(["admin", "member"]).default("member"),
      address: Address.optional(),
    })
    .meta({ id: "User" });
  const Problem = z.object({ detail: z.string() }).meta({ id: "Problem" });

  const users = new Router<{ user: string }>();
  users.get(
    "",
    {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        role: z.array(z.enum(["admin", "member"])).optional(),
      }),
      response: z.array(User),
      summary: "List users",
      tags: ["users"],
    },
    () => [],
  );
  users.post(
    "",
    {
      body: User.omit({ id: true }),
      response: User,
      status: 201,
      responses: { 409: Problem },
      summary: "Create a user",
      tags: ["users"],
    },
    ({ body }) => ({ id: 1, ...body }),
  );
  users.get(
    "/{id:int}",
    {
      path: z.object({ id: z.coerce.number().int() }),
      headers: z.object({ "if-none-match": z.string().optional() }),
      response: User,
      responses: { 304: z.null(), 404: Problem },
      tags: ["users"],
      operationId: "getUser",
    },
    ({ path }) => ({ id: path.id, name: "Ada" }),
  );
  users.delete("/{id:int}", { status: 204, tags: ["users"], deprecated: true }, () => null);
  users.post(
    "/{id:int}/brew",
    {
      body: z.object({ kind: z.enum(["tea", "coffee"]) }).meta({ id: "BrewRequest" }),
      responses: { 418: z.object({ detail: z.string() }) },
      description: "Brew something. Only tea is supported.",
    },
    ({ respond }) => respond(418, { detail: "I'm a teapot" }),
  );

  const app = new Router<{ user: string }>({
    openApi: {
      title: "Users API",
      version: "1.2.3",
      description: "Manage users.",
      servers: [{ url: "https://api.example.com" }],
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    },
  });
  app.includeRouter("/users", users);
  app.get(
    "/me",
    { cookies: z.object({ session: z.string() }), response: User, security: [{ bearer: [] }] },
    () => ({ id: 1, name: "Ada" }),
  );
  app.get("/files/{name}", ({ path }) => path.name);
  app.get("/internal", { includeInSchema: false }, () => null);
  app.includeRouter("/docs", swagger());
  return app;
}

describe("OpenAPI document", () => {
  test("matches the snapshot for a realistic app", async () => {
    const document = realisticApp().openApiDocument();

    await expect(JSON.stringify(document, null, 2) + "\n").toMatchFileSnapshot(
      "__snapshots__/openapi.json",
    );
  });

  test("is a valid OpenAPI 3.1 document", async () => {
    await expectValid(realisticApp().openApiDocument());
  });

  test("is served as JSON", async () => {
    const app = realisticApp();

    const response = await app.fetch(new Request("http://test/openapi.json"), { user: "Ada" });

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual(app.openApiDocument());
  });

  test("defaults the title and version", () => {
    expect(new Router().openApiDocument()).toEqual({
      openapi: "3.1.0",
      info: { title: "API", version: "0.1.0" },
      paths: {},
      components: { schemas: {} },
    });
  });
});

describe("parameters", () => {
  test("carry their JSON Schema", () => {
    const app = new Router();
    app.get(
      "/items/{id}",
      {
        path: z.object({ id: z.coerce.number().int() }),
        query: z.object({ q: z.string().optional(), page: z.coerce.number().default(1) }),
      },
      () => null,
    );

    expect(app.openApiDocument().paths["/items/{id}"]!.get!.parameters).toEqual([
      {
        name: "id",
        in: "path",
        required: true,
        schema: {
          type: "integer",
          minimum: Number.MIN_SAFE_INTEGER,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
      { name: "q", in: "query", required: false, schema: { type: "string" } },
      { name: "page", in: "query", required: false, schema: { type: "number", default: 1 } },
    ]);
  });

  test("follow the convertor without a path schema", () => {
    const app = new Router();
    app.get("/{a}/{b:int}/{c:float}/{d:uuid}/{e:\\d{3}}/{f:path}", () => null);

    const parameters = app.openApiDocument().paths["/{a}/{b}/{c}/{d}/{e}/{f}"]!.get!.parameters!;

    expect(parameters.map(({ schema }) => schema)).toEqual([
      { type: "string" },
      { type: "integer", minimum: 0 },
      { type: "number", minimum: 0 },
      { type: "string", format: "uuid" },
      { type: "string", pattern: "^\\d{3}$" },
      { type: "string" },
    ]);
  });
});

describe("components", () => {
  test("named schemas are referenced", () => {
    const Tag = z.object({ name: z.string() }).meta({ id: "Tag" });
    const app = new Router();
    app.get("/tags", { response: z.array(Tag) }, () => []);
    app.post("/tags", { body: Tag, response: Tag }, ({ body }) => body);

    const document = app.openApiDocument();

    expect(Object.keys(document.components.schemas)).toEqual([
      "HTTPValidationError",
      "Tag-Input",
      "Tag-Output",
      "ValidationError",
    ]);
    expect(document.paths["/tags"]!.post!.requestBody).toEqual({
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Tag-Input" } } },
    });
    expect(document.paths["/tags"]!.get!.responses["200"]).toEqual({
      description: "OK",
      content: {
        "application/json": {
          schema: { type: "array", items: { $ref: "#/components/schemas/Tag-Output" } },
        },
      },
    });
  });

  test("input and output versions share a name when they match", () => {
    const Tag = z.looseObject({ name: z.string() }).meta({ id: "Tag" });
    const app = new Router();
    app.post("/tags", { body: Tag, response: Tag }, ({ body }) => body);

    const document = app.openApiDocument();

    expect(Object.keys(document.components.schemas)).toEqual([
      "HTTPValidationError",
      "Tag",
      "ValidationError",
    ]);
  });

  test("recursive anonymous schemas become components", async () => {
    const Tree: z.ZodType = z.object({
      name: z.string(),
      get children() {
        return z.array(Tree);
      },
    });
    const app = new Router();
    app.get("/tree", { response: Tree }, () => ({ name: "root", children: [] }));

    const document = app.openApiDocument();

    expect(document.paths["/tree"]!.get!.responses["200"]!.content).toEqual({
      "application/json": { schema: { $ref: "#/components/schemas/Schema1" } },
    });
    expect(document.components.schemas.Schema1).toMatchObject({
      properties: { children: { items: { $ref: "#/components/schemas/Schema1" } } },
    });
    await expectValid(document);
  });
});

describe("operations", () => {
  test("operation ids are derived from the method and path and kept unique", () => {
    const app = new Router();
    app.get("/", () => null);
    app.route(["PUT", "PATCH"], "/user-settings/{id}", () => null);
    app.get("/user/settings/{id}", () => null);
    app.get("/user-settings/{id}", { operationId: "putUserSettingsById" }, () => null);

    const ids = Object.values(app.openApiDocument().paths).flatMap((item) =>
      Object.values(item).map((operation) => operation.operationId),
    );

    expect(ids).toEqual([
      "getRoot",
      "putUserSettingsById",
      "patchUserSettingsById",
      "putUserSettingsById2",
      "getUserSettingsById",
    ]);
  });

  test("routers can be left out of the schema", () => {
    const hidden = new Router({ includeInSchema: false });
    hidden.get("/a", () => null);
    const skipped = new Router();
    skipped.get("/b", () => null);
    const app = new Router();
    app.includeRouter("/hidden", hidden);
    app.includeRouter("/skipped", skipped, { includeInSchema: false });

    expect(app.openApiDocument().paths).toEqual({});
  });
});
