import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMaxSize } from "../src/routes/maxSize.js";
import { env, jsonResponse, queryOf } from "./helpers.js";

const call = () => handleMaxSize(new Request("http://test/api/inventory/max-size"), env);

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/inventory/max-size", () => {
  it("returns the size of the largest available item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ records: [{ id: "rec1", fields: { Size: 60 } }] }))
    );

    expect(await (await call()).json()).toEqual({ maxSize: 60 });
  });

  it.each([
    ["there are no items", { records: [] }],
    ["the first item has no size", { records: [{ id: "rec1", fields: {} }] }],
  ])("returns null when %s", async (_name, airtableAnswer) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(airtableAnswer)));

    expect(await (await call()).json()).toEqual({ maxSize: null });
  });

  it("asks Airtable for the single largest available item", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await call();

    const query = queryOf(fetchMock);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/Inventory");
    expect(query.get("pageSize")).toBe("1");
    expect(query.get("sort[0][field]")).toBe("Size");
    expect(query.get("sort[0][direction]")).toBe("desc");
    expect(query.get("filterByFormula")).toContain('{Shipment Status}=""');
  });

  it("lets an Airtable failure bubble up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));

    await expect(call()).rejects.toThrow(/Airtable request failed/);
  });
});
