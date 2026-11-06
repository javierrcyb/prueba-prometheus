import { expect, test } from "@playwright/test";

// Answers every backend request with an empty but valid shape, so the app can
// render without a real backend. The routes of the backend all start with /api/.
async function fakeBackend(page) {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const { pathname } = new URL(route.request().url());

      let body = { records: [] };
      if (pathname.endsWith("/max-size")) body = { maxSize: 60 };
      else if (pathname.endsWith("/sku-groups") || pathname.includes("/lists/")) body = [];
      else if (pathname.endsWith("/request-parties")) body = { partners: [] };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    }
  );
}

test("the app never talks to Airtable directly", async ({ page }) => {
  const airtableRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("api.airtable.com")) airtableRequests.push(request.url());
  });
  await fakeBackend(page);

  await page.goto("/inventory/");
  await page.waitForLoadState("networkidle");

  expect(airtableRequests).toEqual([]);
});

test("no request leaves the browser with an Authorization header", async ({ page }) => {
  const withAuthorization = [];
  page.on("request", (request) => {
    if (request.headers()["authorization"]) withAuthorization.push(request.url());
  });
  await fakeBackend(page);

  await page.goto("/inventory/");
  await page.waitForLoadState("networkidle");

  expect(withAuthorization).toEqual([]);
});
