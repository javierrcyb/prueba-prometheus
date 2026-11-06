// src/test/mocks/handlers.js
// MSW handlers for the app's own backend (routes from src/lib/api.js).
// No Airtable and no API key in the frontend.
import { http, HttpResponse } from "msw";
import { API_URL } from "../../config/api";
import { inventoryRecords, partnerOptions } from "./fixtures";

const API = `${API_URL}/api`;

export const handlers = [
  // getSiteStatus
  http.get(`${API}/site-status`, () =>
    HttpResponse.json({
      announcement: { status: "Offline", message: "" },
      platform: { status: "Online", message: "" },
    })
  ),

  // getSKUGroups -> array
  http.get(`${API}/sku-groups`, () => HttpResponse.json([])),

  // getMaxSize -> { maxSize }
  http.get(`${API}/inventory/max-size`, () =>
    HttpResponse.json({ maxSize: 60 })
  ),

  // getInventoryPage / getAllInventory -> { records: [{ id, fields }], offset? }
  // With an `offset` param it returns the last page (no further offset), so
  // the getAllInventory loop terminates after two pages.
  http.get(`${API}/inventory`, ({ request }) => {
    const hasOffset = new URL(request.url).searchParams.has("offset");
    return HttpResponse.json(
      hasOffset
        ? { records: inventoryRecords }
        : { records: inventoryRecords, offset: "mockOffsetPage2" }
    );
  }),

  // checkAvailability -> { unavailableIds }
  http.post(`${API}/inventory/availability`, () =>
    HttpResponse.json({ unavailableIds: [] })
  ),

  // createRequest -> only ok/status matter
  http.post(`${API}/requests`, () => new HttpResponse(null, { status: 201 })),

  // getRequestParties("partners") -> [{ id, label, clinicians: [{ id, label }] }]
  http.get(`${API}/lists/partners`, () => HttpResponse.json(partnerOptions)),

  // getList / getRequestParties -> array of { id, fields }
  http.get(`${API}/lists/:name`, () =>
    HttpResponse.json([{ id: "recMock1", fields: { Name: "Freedom Innovation" } }])
  ),
];