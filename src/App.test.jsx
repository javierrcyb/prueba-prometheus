// Integration test for the App-level Maintenance/Home gate.
// PentaProvider fetches GET /api/site-status on mount; App renders Maintenance when
// platform.status is "Offline", otherwise the normal Home UI.
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, renderWithProviders, screen } from "./test/utils";
import App from "./App";
import { API_URL } from "./config/api";
import { server } from "./test/mocks/server";

const SITE_STATUS_URL = `${API_URL}/api/site-status`;

const MAINTENANCE_MESSAGE = "Under repairs. Thanks for your patience!";

const offlineStatus = {
  announcement: { status: "Offline", message: "" },
  platform: { status: "Offline", message: MAINTENANCE_MESSAGE },
};

describe("App status gate", () => {
  it("renders the Home UI when the platform status is Online (default handler)", async () => {
    renderWithProviders(<App />);

    // NavBar logo (alt="logo") appears only on the non-maintenance layout.
    expect(await screen.findByAltText("logo")).toBeInTheDocument();
    // The Maintenance page uses a different alt text; it should be absent.
    expect(screen.queryByAltText("Company Logo")).not.toBeInTheDocument();
  });

  it("renders the Maintenance page when the platform status is Offline", async () => {
    server.use(http.get(SITE_STATUS_URL, () => HttpResponse.json(offlineStatus)));

    renderWithProviders(<App />);

    expect(await screen.findByText(MAINTENANCE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByAltText("logo")).not.toBeInTheDocument();
  });

  it("refreshes status on focus and switches to Maintenance", async () => {
    renderWithProviders(<App />);
    expect(await screen.findByAltText("logo")).toBeInTheDocument();

    server.use(http.get(SITE_STATUS_URL, () => HttpResponse.json(offlineStatus)));
    fireEvent.focus(window);

    expect(await screen.findByText(MAINTENANCE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByAltText("logo")).not.toBeInTheDocument();
  });

  it("holds a loading screen until the status resolves, then shows Home", async () => {
    renderWithProviders(<App />);

    // serverStatus starts as null (unknown). The app must NOT render the layout
    // yet, so a request can't start before an eventual "Offline" response.
    expect(screen.queryByAltText("logo")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Company Logo")).not.toBeInTheDocument();

    // Once the status resolves to Online, the Home UI appears.
    expect(await screen.findByAltText("logo")).toBeInTheDocument();
  });

  it("shows an error message when the status fetch fails", async () => {
    server.use(http.get(SITE_STATUS_URL, () => HttpResponse.error()));

    renderWithProviders(<App />);

    // A host failure surfaces an error rather than the Maintenance screen.
    expect(
      await screen.findByText(/trouble reaching the inventory service/i)
    ).toBeInTheDocument();
    expect(screen.queryByAltText("logo")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Company Logo")).not.toBeInTheDocument();
  });

  it("shows an error message when the status endpoint returns 500", async () => {
    server.use(
      http.get(SITE_STATUS_URL, () =>
        HttpResponse.json({ error: "Server error" }, { status: 500 })
      )
    );

    renderWithProviders(<App />);

    expect(
      await screen.findByText(/trouble reaching the inventory service/i)
    ).toBeInTheDocument();
  });
});