import { z } from 'zod'
import { DEFAULT_OPENAPI_URL } from './openApi'
import { Router } from './router'

export function swagger(openApiUrl: string = DEFAULT_OPENAPI_URL): Router {
  const swaggerRouter = new Router({ includeInSchema: false })
  swaggerRouter.get('/', {}, () => new Response(swaggerHtml(openApiUrl), { headers: { 'Content-Type': 'text/html' } }))

  swaggerRouter.get('/{rest:path}', { pathSchema: z.object({ rest: z.string() }) }, async ({ path }) => {
    const { rest } = path
    const r = await fetch(`https://raw.githubusercontent.com/swagger-api/swagger-ui/refs/tags/v5.28.1/dist/${rest}`)
    let contentType = r.headers.get('Content-Type') ?? 'text/html'
    if (rest.endsWith('.js')) {
      contentType = 'application/javascript'
    } else if (rest.endsWith('.css')) {
      contentType = 'text/css'
    } else if (rest.endsWith('.png')) {
      contentType = 'image/png'
    }
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': contentType } })
  })
  return swaggerRouter
}

const swaggerHtml = (openApiUrl: string) => `\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="./swagger-ui.css" />
  <link rel="stylesheet" type="text/css" href="index.css" />
  <link rel="icon" type="image/png" href="./favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="./favicon-16x16.png" sizes="16x16" />
</head>

<body>
  <div id="swagger-ui"></div>
  <script src="./swagger-ui-bundle.js" charset="UTF-8"> </script>
  <script src="./swagger-ui-standalone-preset.js" charset="UTF-8"> </script>
  <script>
    SwaggerUIBundle({
      url: '${openApiUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
      ],
      plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
      ],
      layout: "StandaloneLayout"
    });
  </script>
</body>
</html>`
