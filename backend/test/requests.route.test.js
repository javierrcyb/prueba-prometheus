import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequests } from "../src/routes/requests.js";

const env = {
  AIRTABLE_API_URL: "https://api.airtable.com/v0",
  AIRTABLE_BASE_ID: "appTEST",
  AIRTABLE_API_KEY: "patTEST",
};

const PARTNER_ID = "recPARTNER0000001";
const CLINICIAN_ID = "recCLINICIAN00001";
const ITEM_RECORD_ID = "recITEM00000000001";

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// A fake Airtable. It records every call so each test can inspect what the
// backend asked for. The options change what the fake answers.
function fakeAirtable({
  partnerExists = true,
  clinicianPartners = [PARTNER_ID],
  availableItems = [{ id: ITEM_RECORD_ID, fields: { "Item ID": "T-001" } }],
} = {}) {
  const calls = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method ?? "GET";
      calls.push({ href, method, body: options.body ? JSON.parse(options.body) : null });

      if (href.includes("/Partners/")) {
        return partnerExists
          ? jsonResponse({ id: PARTNER_ID, fields: { Partner: "Test Partner" } })
          : jsonResponse({ error: "NOT_FOUND" }, 404);
      }
      if (href.includes("/Clinicians/")) {
        return jsonResponse({ id: CLINICIAN_ID, fields: { Name: "Dr Test", Partner: clinicianPartners } });
      }
      if (href.includes("/Inventory")) return jsonResponse({ records: availableItems });
      if (href.includes("/Requests") && method === "POST") {
        return jsonResponse({ records: [{ id: "recREQUEST0000001" }] });
      }
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    })
  );

  return calls;
}

const validBody = {
  partnerId: PARTNER_ID,
  clinicianId: CLINICIAN_ID,
  itemIds: ["T-001"],
  notes: "Need pediatric sizes",
  numOfPatients: 2,
  numOfChildren: 1,
};

const post = (body) =>
  handleRequests(
    new Request("http://test/api/requests", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env
  );

const creations = (calls) => calls.filter((call) => call.method === "POST");

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/requests", () => {
  it("creates the request with real record IDs and without typecast", async () => {
    const calls = fakeAirtable();

    const response = await post(validBody);

    expect(response.status).toBe(201);
    const [creation] = creations(calls);
    expect(creation.href).toMatch(/\/Requests$/);
    const fields = creation.body.records[0].fields;
    expect(fields["Items You Would Like"]).toEqual([ITEM_RECORD_ID]);
    expect(fields.Partner).toEqual([PARTNER_ID]);
    expect(fields.Clinician).toEqual([CLINICIAN_ID]);
    expect(fields.Name).toMatch(/^#[0-9A-F]{6}$/);
    expect(creation.body.typecast).toBeUndefined();
  });

  it("answers 409 and creates nothing when an item is no longer available", async () => {
    const calls = fakeAirtable({ availableItems: [] });

    const response = await post(validBody);

    expect(response.status).toBe(409);
    expect(creations(calls)).toHaveLength(0);
  });

  it("rejects a clinician that belongs to another partner", async () => {
    const calls = fakeAirtable({ clinicianPartners: ["recOTHER00000001"] });

    const response = await post(validBody);

    expect(response.status).toBe(400);
    expect(creations(calls)).toHaveLength(0);
  });

  it("rejects a partner that does not exist", async () => {
    const calls = fakeAirtable({ partnerExists: false });

    const response = await post(validBody);

    expect(response.status).toBe(400);
    expect(creations(calls)).toHaveLength(0);
  });

  it.each([
    ["a body that is not JSON", "{oops"],
    ["an unknown field", { ...validBody, admin: true }],
    ["a missing partner", { ...validBody, partnerId: undefined }],
    ["a malformed partner ID", { ...validBody, partnerId: "../Donors" }],
    ["no items", { ...validBody, itemIds: [] }],
    ["duplicate items", { ...validBody, itemIds: ["T-001", "T-001"] }],
    ["notes that are too long", { ...validBody, notes: "x".repeat(2001) }],
    ["a negative count", { ...validBody, numOfPatients: -1 }],
  ])("rejects %s with 400 and never calls Airtable", async (_name, body) => {
    const calls = fakeAirtable();

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("lets an Airtable failure bubble up so index.js can answer 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    await expect(post(validBody)).rejects.toThrow(/Airtable request failed/);
  });
});
