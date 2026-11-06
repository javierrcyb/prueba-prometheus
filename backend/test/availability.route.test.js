import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAvailability } from "../src/routes/availability.js";
import { env, jsonResponse } from "./helpers.js";

const post = (body) =>
  handleAvailability(
    new Request("http://test/api/inventory/availability", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env
  );

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/inventory/availability", () => {
  it("returns the items that can no longer be requested", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ records: [{ id: "recA", fields: { "Item ID": "T-001" } }] }))
    );

    const response = await post({ itemIds: ["T-001", "T-002"] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unavailableIds: ["T-002"] });
  });

  it("returns an empty list when everything is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ records: [{ id: "recA", fields: { "Item ID": "T-001" } }] }))
    );

    const response = await post({ itemIds: ["T-001"] });

    expect(await response.json()).toEqual({ unavailableIds: [] });
  });

  it.each([
    ["a body that is not JSON", "{oops"],
    ["a missing itemIds", {}],
    ["an unknown field", { itemIds: ["T-001"], extra: true }],
    ["an empty list", { itemIds: [] }],
    ["duplicates", { itemIds: ["T-001", "T-001"] }],
    ["an ID that is not text", { itemIds: [1] }],
    ["an ID that is too long", { itemIds: ["x".repeat(41)] }],
    ["more than 100 IDs", { itemIds: Array.from({ length: 101 }, (_, index) => `T-${index}`) }],
  ])("rejects %s with 400 and never calls Airtable", async (_name, body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body that is too large with 413", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await post({ itemIds: ["T-001"], notes: "x".repeat(20001) });

    expect(response.status).toBe(413);
  });

  it("lets an Airtable failure bubble up so index.js can answer 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    await expect(post({ itemIds: ["T-001"] })).rejects.toThrow(/Airtable request failed/);
  });
});
