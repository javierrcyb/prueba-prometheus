import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSkuGroups, normalizeInventoryGroups } from "../src/routes/skuGroups.js";
import { env, jsonResponse } from "./helpers.js";

// A valid Airtable record for the "SKU Groups" table. Override any field.
const record = (id, fields = {}) => ({
  id,
  fields: { Active: true, Name: "Knee", Key: "knee", "SKU Item Codes": ["K1"], ...fields },
});

afterEach(() => vi.unstubAllGlobals());

describe("normalizeInventoryGroups", () => {
  it("returns the clean shape the app uses", () => {
    expect(normalizeInventoryGroups([record("recG1")])).toEqual([
      { id: "recG1", key: "knee", title: "Knee", skuCodes: ["K1"], imageUrl: null, imageUrls: [] },
    ]);
  });

  it.each([
    ["an inactive group", { Active: false }],
    ["a group without a name", { Name: "  " }],
    ["a key with spaces", { Key: "Bad Key" }],
    ["a key in capitals", { Key: "KNEE" }],
    ["a group without SKU codes", { "SKU Item Codes": [] }],
    ["a group whose codes are not a list", { "SKU Item Codes": "K1" }],
  ])("skips %s", (_name, fields) => {
    expect(normalizeInventoryGroups([record("recG1", fields)])).toEqual([]);
  });

  it("skips a second group that repeats a key", () => {
    const groups = normalizeInventoryGroups([
      record("recG1", { Name: "Knee A" }),
      record("recG2", { Name: "Knee B" }),
    ]);

    expect(groups).toHaveLength(1);
  });

  it("trims names and codes and removes repeated codes", () => {
    const [group] = normalizeInventoryGroups([
      record("recG1", { Name: "  Knee  ", "SKU Item Codes": [" K1 ", "K1", "K2"] }),
    ]);

    expect(group.title).toBe("Knee");
    expect(group.skuCodes).toEqual(["K1", "K2"]);
  });

  it("sorts the groups by title", () => {
    const titles = normalizeInventoryGroups([
      record("recG1", { Name: "Zeta", Key: "zeta", "SKU Item Codes": ["Z"] }),
      record("recG2", { Name: "Alpha", Key: "alpha", "SKU Item Codes": ["A"] }),
    ]).map((group) => group.title);

    expect(titles).toEqual(["Alpha", "Zeta"]);
  });

  it("gives a SKU code only to the first group, and drops groups left empty", () => {
    const groups = normalizeInventoryGroups([
      record("recG1", { Name: "Alpha", Key: "alpha", "SKU Item Codes": ["A", "B"] }),
      record("recG2", { Name: "Beta", Key: "beta", "SKU Item Codes": ["B", "C"] }),
      record("recG3", { Name: "Gamma", Key: "gamma", "SKU Item Codes": ["A"] }),
    ]);

    expect(groups.map((group) => [group.key, group.skuCodes])).toEqual([
      ["alpha", ["A", "B"]],
      ["beta", ["C"]],
    ]);
  });

  it("prefers the large thumbnail and falls back to the original image", () => {
    const [group] = normalizeInventoryGroups([
      record("recG1", {
        Image: [{ url: "full.png", thumbnails: { large: { url: "large.png" } } }, { url: "second.png" }],
      }),
    ]);

    expect(group.imageUrls).toEqual(["large.png", "second.png"]);
    expect(group.imageUrl).toBe("large.png");
  });
});

describe("GET /api/sku-groups", () => {
  const call = () => handleSkuGroups(new Request("http://test/api/sku-groups"), env);

  it("reads every page and returns the finished groups", async () => {
    const page1 = record("recG1", { Name: "Beta", Key: "beta", "SKU Item Codes": ["B"] });
    const page2 = record("recG2", { Name: "Alpha", Key: "alpha", "SKU Item Codes": ["A"] });
    const fetchMock = vi.fn(async (url) => {
      const offset = new URL(String(url)).searchParams.get("offset");
      return offset
        ? jsonResponse({ records: [page2] })
        : jsonResponse({ records: [page1], offset: "itr1" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await call();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await response.json()).map((group) => group.title)).toEqual(["Alpha", "Beta"]);
  });

  it("never returns a partial list when a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const offset = new URL(String(url)).searchParams.get("offset");
        return offset
          ? new Response("{}", { status: 500 })
          : jsonResponse({ records: [record("recG1")], offset: "itr1" });
      })
    );

    await expect(call()).rejects.toThrow(/Airtable request failed/);
  });
});
