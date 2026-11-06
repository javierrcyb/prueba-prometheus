import { afterEach, describe, expect, it, vi } from "vitest";
import { listRoutes } from "../src/routes/lists.js";
import { env, jsonResponse } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("list routes", () => {
  it("only registers GET /api/lists/<name> routes", () => {
    const keys = Object.keys(listRoutes);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => /^GET \/api\/lists\/[a-z]+$/.test(key))).toBe(true);
  });

  it("does not register tables that are not approved", () => {
    for (const name of ["inventory", "requests", "donors", "constructor", "__proto__"]) {
      expect(Object.hasOwn(listRoutes, `GET /api/lists/${name}`)).toBe(false);
    }
  });
});

describe("GET /api/lists/manufacturers", () => {
  const call = () =>
    listRoutes["GET /api/lists/manufacturers"](
      new Request("http://test/api/lists/manufacturers"),
      env
    );

  it("returns only the fields the app needs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          records: [{ id: "recM1", fields: { Name: "Acme", Phone: "555", Notes: "private" } }],
        })
      )
    );

    const response = await call();

    expect(await response.json()).toEqual([{ id: "recM1", fields: { Name: "Acme" } }]);
  });

  it("reads every page", async () => {
    const fetchMock = vi.fn(async (url) => {
      const offset = new URL(String(url)).searchParams.get("offset");
      return offset
        ? jsonResponse({ records: [{ id: "recM2", fields: { Name: "Beta" } }] })
        : jsonResponse({ records: [{ id: "recM1", fields: { Name: "Alpha" } }], offset: "itr1" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await call();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await response.json()).map((record) => record.id)).toEqual(["recM1", "recM2"]);
  });

  it("lets an Airtable failure bubble up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    await expect(call()).rejects.toThrow(/Airtable request failed/);
  });
});
