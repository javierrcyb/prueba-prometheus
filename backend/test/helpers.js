// Shared by the backend tests. Use the same variable names your lib/airtable.js reads.
export const env = {
  AIRTABLE_API_URL: "https://api.airtable.com/v0",
  AIRTABLE_BASE_ID: "appTEST",
  AIRTABLE_API_KEY: "patTEST",
};

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// The query string that the fake Airtable received on one call.
export const queryOf = (fetchMock, callIndex = 0) =>
  new URL(String(fetchMock.mock.calls[callIndex][0])).searchParams;
