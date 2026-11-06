import { afterEach, describe, expect, it, vi } from "vitest";
import { handleInventory } from "../src/routes/inventory.js";

// A fake environment. Use the same variable names your lib/airtable.js reads.
const env = {
  AIRTABLE_API_URL: "https://api.airtable.com/v0",
  AIRTABLE_BASE_ID: "appTEST",
  AIRTABLE_API_KEY: "patTEST",
};

const airtableOk = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const call = (query) => handleInventory(new Request(`http://test/api/inventory?${query}`), env);

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/inventory", () => {
  it("returns the records and the offset that Airtable gave", async () => {
    const records = [{ id: "rec1", fields: { "Item ID": "T-001" } }];
    vi.stubGlobal("fetch", vi.fn(async () => airtableOk({ records, offset: "itrAAA/rec1" })));

    const response = await call("pageSize=5");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ records, offset: "itrAAA/rec1" });
  });

  it("uses the token with Airtable but never sends it to the browser", async () => {
    const fetchMock = vi.fn(async () => airtableOk({ records: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("pageSize=5");

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer patTEST");
    expect(await response.text()).not.toContain("patTEST");
  });

  it("does not call Airtable when the input is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await call("pageSize=0");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Airtable a formula where user text is escaped", async () => {
    const fetchMock = vi.fn(async () => airtableOk({ records: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await call(`search=${encodeURIComponent('x") , TRUE() , ("')}`);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("filterByFormula")).toContain('SEARCH("x\\")",{StringSearch})');
  });

  it("lets an Airtable failure bubble up so index.js can answer 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));

    await expect(call("pageSize=5")).rejects.toThrow(/Airtable request failed/);
  });
});
