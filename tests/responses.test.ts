import { InvalidResponseError, redirect, ResponseError, Router, stream } from "tastapi";
import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);

describe("responses", () => {
  test("a returned Response skips response validation", async () => {
    const app = new Router();
    app.get("/raw", { response: z.object({ id: z.number() }) }, () => new Response("raw"));

    const response = await app.fetch(request("/raw"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("raw");
  });

  test("an invalid response becomes a 500 and reaches onError", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const app = new Router({ onError });
    app.get("/user", { response: z.object({ id: z.number() }) }, () => ({ id: "x" }) as never);

    const response = await app.fetch(request("/user"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ detail: "Internal Server Error" });
    expect(onError).toHaveBeenCalledWith(expect.any(InvalidResponseError));
  });

  test("a thrown error becomes a 500 and reaches onError", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const app = new Router({ onError });
    const error = new Error("boom");
    app.get("/boom", {}, () => {
      throw error;
    });

    const response = await app.fetch(request("/boom"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ detail: "Internal Server Error" });
    expect(onError).toHaveBeenCalledWith(error);
  });

  test("onError defaults to console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new Router();
    app.get("/boom", {}, () => {
      throw new Error("boom");
    });

    await app.fetch(request("/boom"));

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  test("a thrown ResponseError becomes its response", async () => {
    const app = new Router();
    app.get("/teapot", {}, () => {
      throw new ResponseError(418, { reason: "teapot" }, { headers: { "retry-after": "5" } });
    });

    const response = await app.fetch(request("/teapot"));

    expect(response.status).toBe(418);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toEqual({ detail: { reason: "teapot" } });
  });

  test("JSON bodies are compact with no trailing newline", async () => {
    const app = new Router();
    app.get("/data", {}, () => ({ a: [1, 2] }));

    const response = await app.fetch(request("/data"));

    expect(await response.text()).toBe('{"a":[1,2]}');
  });

  test("undefined becomes null", async () => {
    const app = new Router();
    app.get("/", () => undefined);

    expect(await (await app.fetch(request("/"))).text()).toBe("null");
  });

  test("statuses without a body send no body", async () => {
    const app = new Router();
    app.delete("/", { status: 204 }, () => null);

    const response = await app.fetch(request("/", { method: "DELETE" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
  });

  test("respond validates against the declared schema", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const app = new Router({ onError });
    app.get("/", { responses: { 404: z.object({ detail: z.string() }) } }, ({ respond }) =>
      respond(404, { detail: 1 } as never),
    );

    const response = await app.fetch(request("/"));

    expect(response.status).toBe(500);
    expect(onError).toHaveBeenCalledWith(expect.any(InvalidResponseError));
    expect(onError.mock.calls[0]![0]).toMatchObject({ data: { detail: 1 } });
  });

  test("redirect takes a status and headers", () => {
    const response = redirect(new URL("https://example.com/"), 301, { headers: { "x-a": "1" } });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://example.com/");
    expect(response.headers.get("x-a")).toBe("1");
  });

  test("stream accepts a ReadableStream", async () => {
    const response = stream(new Blob(["abc"]).stream());

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(await response.text()).toBe("abc");
  });

  test("stream accepts bytes and stops the iterator on cancel", async () => {
    let finished = false;
    async function* chunks() {
      try {
        yield new Uint8Array([104, 105]);
        yield "never read";
      } finally {
        finished = true;
      }
    }
    const reader = stream(chunks()).body!.getReader();

    expect((await reader.read()).value).toEqual(new Uint8Array([104, 105]));
    await reader.cancel();

    expect(finished).toBe(true);
  });
});
