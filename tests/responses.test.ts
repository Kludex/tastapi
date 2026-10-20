import { InvalidResponseError, Router } from "tastapi";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

const request = (path: string, init?: RequestInit) => new Request(`http://test${path}`, init);

describe("responses", () => {
  test("a returned Response skips response validation", async () => {
    const app = new Router();
    app.get("/raw", { responseSchema: z.object({ id: z.number() }) }, () => new Response("raw"));

    const response = await app.fetch(request("/raw"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("raw");
  });

  test("an invalid response becomes a 500 and reaches onError", async () => {
    const onError = vi.fn();
    const app = new Router({ onError });
    app.get(
      "/user",
      { responseSchema: z.object({ id: z.number() }) },
      () => ({ id: "x" }) as never,
    );

    const response = await app.fetch(request("/user"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ detail: "Internal Server Error" });
    expect(onError).toHaveBeenCalledWith(expect.any(InvalidResponseError));
  });

  test("a thrown error becomes a 500 and reaches onError", async () => {
    const onError = vi.fn();
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
});
