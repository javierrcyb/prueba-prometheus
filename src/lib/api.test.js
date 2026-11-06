import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The tests talk to a fake address, never to a real backend.
vi.mock("../config/api", () => ({ API_URL: "http://backend.test" }));

import {
  checkAvailability,
  createRequest,
  getAllInventory,
  getInventoryPage,
  getList,
  getMaxSize,
  getSKUGroups,
} from "./api";

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Replaces fetch for one test and returns the mock so the test can inspect calls.
const stubFetch = (implementation) => {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const urlOf = (fetchMock, callIndex = 0) => new URL(String(fetchMock.mock.calls[callIndex][0]));

// Failures are logged on purpose; keep the test output clean.
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getInventoryPage", () => {
  it("repeats list parameters and skips empty ones", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ records: [] }));

    await getInventoryPage({
      pageSize: 36,
      tags: ["Prosthesis", "Pediatric"],
      search: "",
      part: undefined,
      offset: null,
    });

    const url = urlOf(fetchMock);
    expect(url.origin + url.pathname).toBe("http://backend.test/api/inventory");
    expect([...url.searchParams.keys()].sort()).toEqual(["pageSize", "tags", "tags"]);
    expect(url.searchParams.getAll("tags")).toEqual(["Prosthesis", "Pediatric"]);
  });

  it("keeps names that contain commas and spaces as one value", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ records: [] }));

    await getInventoryPage({ manufacturers: ["Knee, Hydraulic"] });

    expect(urlOf(fetchMock).searchParams.getAll("manufacturers")).toEqual(["Knee, Hydraulic"]);
  });

  it("returns the records and the offset, or a null offset on the last page", async () => {
    stubFetch(async () => jsonResponse({ records: [{ id: "rec1" }], offset: "itr1" }));
    expect(await getInventoryPage()).toEqual({ records: [{ id: "rec1" }], offset: "itr1" });

    stubFetch(async () => jsonResponse({ records: [{ id: "rec1" }] }));
    expect(await getInventoryPage()).toEqual({ records: [{ id: "rec1" }], offset: null });
  });

  it("returns null when the backend answers with an error", async () => {
    stubFetch(async () => jsonResponse({ error: "bad" }, 400));

    expect(await getInventoryPage()).toBeNull();
  });

  it("returns null when the answer has no list of records", async () => {
    stubFetch(async () => jsonResponse({ something: "else" }));

    expect(await getInventoryPage()).toBeNull();
  });

  it("returns null when the network fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await getInventoryPage()).toBeNull();
  });
});

describe("getAllInventory", () => {
  it("follows the offset until there are no more pages", async () => {
    const answers = {
      none: jsonResponse({ records: [{ id: "rec1" }], offset: "o1" }),
      o1: jsonResponse({ records: [{ id: "rec2" }], offset: "o2" }),
      o2: jsonResponse({ records: [{ id: "rec3" }] }),
    };
    const fetchMock = stubFetch(async (url) => {
      const offset = new URL(String(url)).searchParams.get("offset");
      return answers[offset ?? "none"];
    });

    const records = await getAllInventory({ tags: ["Orthosis"] });

    expect(records.map((record) => record.id)).toEqual(["rec1", "rec2", "rec3"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlOf(fetchMock, 0).searchParams.get("pageSize")).toBe("100");
    expect(urlOf(fetchMock, 2).searchParams.get("tags")).toBe("Orthosis");
  });

  it("returns null, never a partial list, when a page fails", async () => {
    stubFetch(async (url) => {
      const offset = new URL(String(url)).searchParams.get("offset");
      return offset ? jsonResponse({}, 500) : jsonResponse({ records: [{ id: "rec1" }], offset: "o1" });
    });

    expect(await getAllInventory()).toBeNull();
  });
});

describe("getMaxSize", () => {
  it("returns the number", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ maxSize: 60 }));

    expect(await getMaxSize()).toBe(60);
    expect(urlOf(fetchMock).pathname).toBe("/api/inventory/max-size");
  });

  it.each([
    ["a number written as text", { maxSize: "60" }],
    ["a missing value", {}],
    ["a null value", { maxSize: null }],
  ])("returns null for %s", async (_name, body) => {
    stubFetch(async () => jsonResponse(body));

    expect(await getMaxSize()).toBeNull();
  });

  it("returns null when the request fails", async () => {
    stubFetch(async () => jsonResponse({}, 500));

    expect(await getMaxSize()).toBeNull();
  });
});

describe("getSKUGroups", () => {
  it("returns the groups", async () => {
    const fetchMock = stubFetch(async () => jsonResponse([{ id: "recG1", key: "knee" }]));

    expect(await getSKUGroups()).toEqual([{ id: "recG1", key: "knee" }]);
    expect(urlOf(fetchMock).pathname).toBe("/api/sku-groups");
  });

  it("returns null when the request fails", async () => {
    stubFetch(async () => jsonResponse({}, 502));

    expect(await getSKUGroups()).toBeNull();
  });
});

describe("getList", () => {
  it("reads one approved list", async () => {
    const fetchMock = stubFetch(async () => jsonResponse([{ id: "recM1", fields: { Name: "Acme" } }]));

    expect(await getList("manufacturers")).toEqual([{ id: "recM1", fields: { Name: "Acme" } }]);
    expect(urlOf(fetchMock).pathname).toBe("/api/lists/manufacturers");
  });

  it("returns null for a list that does not exist or an answer that is not a list", async () => {
    stubFetch(async () => jsonResponse({ error: "Not found" }, 404));
    expect(await getList("inventory")).toBeNull();

    stubFetch(async () => jsonResponse({ records: [] }));
    expect(await getList("manufacturers")).toBeNull();
  });
});

describe("checkAvailability", () => {
  it("sends the IDs as JSON and returns the unavailable ones", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ unavailableIds: ["T-002"] }));

    const result = await checkAvailability(["T-001", "T-002"]);

    expect(result).toEqual(["T-002"]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/api/inventory/availability");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ itemIds: ["T-001", "T-002"] });
  });

  it("returns null when the check fails, so the cart does not assume everything is available", async () => {
    stubFetch(async () => jsonResponse({}, 502));
    expect(await checkAvailability(["T-001"])).toBeNull();

    stubFetch(async () => jsonResponse({ unexpected: true }));
    expect(await checkAvailability(["T-001"])).toBeNull();
  });
});

describe("createRequest", () => {
  const data = { partnerId: "recP1", itemIds: ["T-001"] };

  it("reports success and sends the data as JSON", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }, 201));

    expect(await createRequest(data)).toEqual({ ok: true, status: 201 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/api/requests");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(data);
  });

  it("reports the status so the cart can tell an unavailable item (409) from other errors", async () => {
    stubFetch(async () => jsonResponse({ error: "Some items are no longer available" }, 409));

    expect(await createRequest(data)).toEqual({ ok: false, status: 409 });
  });

  it("reports status 0 when the network fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await createRequest(data)).toEqual({ ok: false, status: 0 });
  });
});
