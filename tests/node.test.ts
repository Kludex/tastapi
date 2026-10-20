import { createServer, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { json, Router, stream } from "tastapi";
import { toNodeListener } from "tastapi/node";
import { server as exampleServer } from "../docs/examples/node_server.ts";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import * as z from "zod";

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

app.get("/broken", () =>
  stream(
    (async function* () {
      yield "a";
      throw new Error("boom");
    })(),
  ),
);
let onCancel = () => {};
app.get("/forever", () =>
  stream(
    (async function* () {
      try {
        for (;;) {
          yield "tick";
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      } finally {
        onCancel();
      }
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  // Deno's `node:http` rejects HTTP/1.0 requests without a Host header.
  test.skipIf("Deno" in globalThis)("falls back to localhost without a Host header", async () => {
    const socket = connect(Number(new URL(base).port), "127.0.0.1");
    socket.end("GET /url HTTP/1.0\r\n\r\n");
    let raw = "";
    for await (const chunk of socket) {
      raw += String(chunk);
    }

    expect(raw).toContain('{"url":"http://localhost/url"}');
  });

  test("answers 500 when the handler throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createServer(
      toNodeListener(() => {
        throw new TypeError("handler bug");
      }),
    );
    await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", resolve));

    const response = await fetch(`http://127.0.0.1:${(failing.address() as AddressInfo).port}/`);

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(new TypeError("handler bug"));
    await new Promise<void>((resolve) => failing.close(() => resolve()));
  });

  test("reports a body stream that fails midway", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      fetch(`${base}/broken`).then((response) => response.text()),
    ).rejects.toBeInstanceOf(Error);

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(new Error("boom")));
  });

  test("stops streaming quietly when the client goes away", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const cancelled = new Promise<void>((resolve) => (onCancel = resolve));
    const controller = new AbortController();
    const response = await fetch(`${base}/forever`, { signal: controller.signal });
    const reader = response.body!.getReader();
    await reader.read();

    controller.abort();
    await cancelled;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(consoleError).not.toHaveBeenCalled();
  });

  test("the docs example serves the app", async () => {
    await new Promise<void>((resolve) => exampleServer.listen(0, "127.0.0.1", resolve));
    const port = (exampleServer.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/`);

    expect(await response.json()).toEqual({ message: "Hello, world!" });
    await new Promise<void>((resolve) => exampleServer.close(() => resolve()));
  });
});
