import { Hono } from "hono";
import { AutoRouter } from "itty-router";
import { Router } from "../src/index.ts";

export const RESOURCES = 50;

type FetchApp = { fetch: (request: Request) => Promise<Response> | Response };

/** 200 routes: list, create, read and delete for 50 resources. */
export function tastapi(): FetchApp {
  const app = new Router();
  for (let index = 0; index < RESOURCES; index++) {
    app.get(`/resource${index}`, () => ({ ok: true }));
    app.post(`/resource${index}`, () => ({ ok: true }));
    app.get(`/resource${index}/{id}`, ({ path }) => ({ id: path.id }));
    app.delete(`/resource${index}/{id}`, ({ path }) => ({ id: path.id }));
  }
  return { fetch: (request) => app.fetch(request) };
}

export function hono(): FetchApp {
  const app = new Hono();
  for (let index = 0; index < RESOURCES; index++) {
    app.get(`/resource${index}`, (c) => c.json({ ok: true }));
    app.post(`/resource${index}`, (c) => c.json({ ok: true }));
    app.get(`/resource${index}/:id`, (c) => c.json({ id: c.req.param("id") }));
    app.delete(`/resource${index}/:id`, (c) => c.json({ id: c.req.param("id") }));
  }
  return app;
}

export function itty(): FetchApp {
  const app = AutoRouter();
  for (let index = 0; index < RESOURCES; index++) {
    app.get(`/resource${index}`, () => ({ ok: true }));
    app.post(`/resource${index}`, () => ({ ok: true }));
    app.get(`/resource${index}/:id`, ({ params }) => ({ id: params.id }));
    app.delete(`/resource${index}/:id`, ({ params }) => ({ id: params.id }));
  }
  return app;
}

export const APPS = { tastapi, hono, "itty-router": itty };

export const REQUESTS = {
  "first static route": "/resource0",
  "last static route": `/resource${RESOURCES - 1}`,
  "last parameter route": `/resource${RESOURCES - 1}/42`,
  "not found": "/missing",
};
