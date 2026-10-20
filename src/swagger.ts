import { html } from "./responses.ts";
import { Router } from "./router.ts";

const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.28.1";

/** A router that serves Swagger UI for the OpenAPI document at `openApiUrl`. */
export function swagger(openApiUrl = "/openapi.json"): Router {
  const router = new Router({ includeInSchema: false });
  const page = swaggerHtml(JSON.stringify(openApiUrl).replaceAll("<", "\\u003c"));
  router.get("", () => html(page));
  return router;
}

const swaggerHtml = (url: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Swagger UI</title>
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css">
  <link rel="icon" type="image/png" href="${SWAGGER_UI}/favicon-32x32.png" sizes="32x32">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: ${url},
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    });
  </script>
</body>
</html>`;
