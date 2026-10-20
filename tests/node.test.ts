import { createServer, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { json, Router, stream } from "tastapi";
import { toNodeListener } from "tastapi/node";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

const app = new Router();
app.post("/echo", { body: z.object({ name: z.string() }) }, ({ body, request }) =>
  json({ ...body, url: request.url }, { headers: { "x-a": "1" } }),
);
app.get("/cookies", () => {
  const headers = new Headers();
  headers.append("set-cookie", "a=1");
  headers.append("set-cookie", "b=2");
  return new Response(null, { status: 204, headers });
});
app.get("/url", ({ request }) => ({ url: request.url }));
app.get("/stream", () =>
  stream(
    (async function* () {
      yield "a";
      yield "b";
    })(),
  ),
);

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(toNodeListener((request) => app.fetch(request)));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("toNodeListener", () => {
  test("passes the request body and returns the response", async () => {
    const response = await fetch(`${base}/echo?x=1`, {
      method: "POST",
      body: JSON.stringify({ name: "Ada" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-a")).toBe("1");
    expect(await response.json()).toEqual({ name: "Ada", url: `${base}/echo?x=1` });
  });

  test("keeps every set-cookie header", async () => {
    const response = await fetch(`${base}/cookies`);

    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  test("streams the body", async () => {
    expect(await (await fetch(`${base}/stream`)).text()).toBe("ab");
  });

  test("HEAD has no body", async () => {
    const response = await fetch(`${base}/stream`, { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("falls back to localhost without a Host header", async () => {
    const socket = connect(Number(new URL(base).port), "127.0.0.1");
    socket.end("GET /url HTTP/1.0\r\n\r\n");
    let raw = "";
    for await (const chunk of socket) {
      raw += String(chunk);
    }

    expect(raw).toContain('{"url":"http://localhost/url"}');
  });
});
