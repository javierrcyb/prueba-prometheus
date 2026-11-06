import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "./helpers.js";

// These tests are about ROUTING. cors.js is replaced by a tiny stand-in so they
// do not depend on how your CORS settings are configured (test cors.js on its
// own, with a separate test file).
vi.mock("../src/lib/cors.js", () => ({
  getCorsHeaders: () => ({ "Access-Control-Allow-Origin": "http://localhost:5173" }),
  withCors: (response, headers) => {
    const merged = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers)) merged.set(name, value);
    return new Response(response.body, { status: response.status, headers: merged });
  },
}));

import worker from "../src/index.js";

const call = (path, init) => worker.fetch(new Request(`http://test${path}`, init), env, {});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("router", () => {
  it("answers 404 for a route that does not exist, with CORS headers", async () => {
    const response = await call("/api/nope");

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("answers 404 when a known path is used with the wrong method", async () => {
    // If you later decide to answer 405 here, change this expectation.
    expect((await call("/api/site-status", { method: "POST" })).status).toBe(404);
    expect((await call("/api/requests")).status).toBe(404);
  });

  it.each(["inventory", "requests", "constructor", "__proto__"])(
    "does not serve /api/lists/%s",
    async (name) => {
      expect((await call(`/api/lists/${name}`)).status).toBe(404);
    }
  );

  it("answers the browser's preflight check with 204 and CORS headers", async () => {
    const response = await call("/api/requests", { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

describe("registered routes", () => {
  // Each request below is invalid on purpose: a 400 (and not a 404) proves the
  // route is registered, and nothing is sent to Airtable.
  it.each([
    ["GET", "/api/inventory?pageSize=0"],
    ["POST", "/api/inventory/availability"],
    ["POST", "/api/requests"],
  ])("%s %s reaches its handler", async (method, path) => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await call(path, method === "POST" ? { method, body: "{oops" } : { method });

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("errors", () => {
  it("turns a handler failure into a generic 502 that leaks nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));

    const response = await call("/api/inventory?pageSize=5");
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).toContain("Upstream service unavailable");
    expect(text).not.toContain("403");
    expect(text).not.toContain("patTEST");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});
