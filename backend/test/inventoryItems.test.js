import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findAvailableItems,
  MAX_ITEM_IDS_PER_LOOKUP,
  parseItemIds,
} from "../src/lib/inventoryItems.js";
import { env, jsonResponse, queryOf } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("parseItemIds", () => {
  it("accepts a list of unique IDs and trims them", () => {
    expect(parseItemIds([" 26-1813 ", "26-1595"], 100)).toEqual({
      value: ["26-1813", "26-1595"],
    });
  });

  it.each([
    ["something that is not a list", "26-1813"],
    ["an empty list", []],
    ["an empty ID", ["26-1813", "  "]],
    ["an ID that is not text", [26]],
    ["an ID that is too long", ["x".repeat(41)]],
    ["duplicates", ["26-1813", "26-1813"]],
    ["duplicates after trimming", ["26-1813", " 26-1813"]],
  ])("rejects %s", (_name, raw) => {
    expect(parseItemIds(raw, 100).error).toBeDefined();
  });

  it("rejects more IDs than the limit", () => {
    const ids = Array.from({ length: 101 }, (_, index) => `T-${index}`);

    expect(parseItemIds(ids, 100).error).toMatch(/at most 100/);
  });
});

describe("findAvailableItems", () => {
  it("maps each available Item ID to its Airtable record ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          records: [
            { id: "recA", fields: { "Item ID": "T-001" } },
            { id: "recB", fields: { "Item ID": ["T-002"] } }, // lookup fields arrive as arrays
            { id: "recC", fields: {} }, // no Item ID: ignored
          ],
        })
      )
    );

    const available = await findAvailableItems(env, ["T-001", "T-002", "T-003"]);

    expect([...available.entries()]).toEqual([
      ["T-001", "recA"],
      ["T-002", "recB"],
    ]);
  });

  it("asks Airtable in batches", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const ids = Array.from({ length: MAX_ITEM_IDS_PER_LOOKUP + 50 }, (_, index) => `T-${index}`);

    await findAvailableItems(env, ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("only looks at items that are still available", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await findAvailableItems(env, ["T-001"]);

    const formula = queryOf(fetchMock).get("filterByFormula");
    expect(formula).toContain("{Requests}=BLANK()");
    expect(formula).toContain("{Shipment Status}=BLANK()");
  });

  it("escapes quotes in the IDs", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ records: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await findAvailableItems(env, ['a"b']);

    expect(queryOf(fetchMock).get("filterByFormula")).toContain('{Item ID}="a\\"b"');
  });

  it("lets an Airtable failure bubble up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    await expect(findAvailableItems(env, ["T-001"])).rejects.toThrow(/Airtable request failed/);
  });
});
