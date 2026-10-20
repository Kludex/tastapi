import { Router, swagger } from "tastapi";
import { describe, expect, test } from "vitest";

const request = (path: string) => new Request(`http://test${path}`);

describe("swagger", () => {
  test("serves Swagger UI from a pinned CDN", async () => {
    const app = new Router({ openApi: { title: "Example" } });
    app.includeRouter("/docs", swagger());

    const response = await app.fetch(request("/docs"));
    const html = await response.text();

    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain(
      "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.28.1/swagger-ui-bundle.js",
    );
    expect(html).toContain('url: "/openapi.json"');
  });

  test("does not proxy assets", async () => {
    const app = new Router();
    app.includeRouter("/docs", swagger());

    expect((await app.fetch(request("/docs/swagger-ui.css"))).status).toBe(404);
  });

  test("escapes the OpenAPI URL", async () => {
    const app = new Router();
    app.includeRouter("/docs", swagger("/x</script>"));

    const html = await (await app.fetch(request("/docs"))).text();

    expect(html).toContain('url: "/x\\u003c/script>"');
  });
});
