import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, userEvent, waitFor } from "../test/utils";
import PentaContext from "../context/PentaContext";
import Cart, {
  checkCartItemAvailability,
  createRequestFields,
  getCartItemKeys,
} from "./Cart";
import {
  ANNOUNCEMENT_DISMISSAL_KEY,
  getRequestParty,
  setRequestParty,
} from "../lib/storage";


afterEach(() => {
  vi.restoreAllMocks();
});

// ---- helpers -------------------------------------------------------------

const demoParty = {
  partnerId: "recDemoClinic",
  partnerName: "Demo Clinic",
  clinicianRequired: false,
  clinicianId: null,
  clinicianName: null,
};

const seedDemoCart = () => {
  localStorage.setItem("partner", demoParty.partnerName);
  setRequestParty(demoParty);
  localStorage.setItem(
    "22-1287",
    JSON.stringify({
      "Item ID": "22-1287",
      "Description (from SKU)": ["Demo Item"],
    })
  );
};

// Mocks the app's own backend (routes from src/lib/api.js):
//   POST /api/inventory/availability -> { unavailableIds }
//   POST /api/requests               -> only ok/status matter
const mockBackend = ({
  unavailableIds = [],
  requestResult = { ok: true, status: 201 },
  onRequest,
} = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith("/api/inventory/availability")) {
      return { ok: true, status: 200, json: async () => ({ unavailableIds }) };
    }
    if (path.endsWith("/api/requests") && options.method === "POST") {
      onRequest?.(JSON.parse(options.body));
      return { ...requestResult, json: async () => ({}) };
    }
    throw new Error(`Unexpected request: ${path}`);
  });

const callsTo = (spy, suffix) =>
  spy.mock.calls.filter(([url]) => String(url).endsWith(suffix));

const renderCart = (contextOverrides = {}, initialEntries = ["/cart"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <PentaContext.Provider
        value={{
          inventoryGroups: [],
          selectedPartner: "Demo Clinic",
          setSelectedPartner: vi.fn(),
          setCartCount: vi.fn(),
          ...contextOverrides,
        }}
      >
        <Cart />
      </PentaContext.Provider>
    </MemoryRouter>,
    { withProviders: false }
  );

const fillPatientCounts = async (user, patients, children) => {
  await user.type(
    screen.getByLabelText(/How many patients do you plan to help/i),
    patients
  );
  await user.type(
    screen.getByLabelText(/How many of the patients are children/i),
    children
  );
};

// ---- tests ---------------------------------------------------------------

describe("Cart item detection", () => {
  it("treats application metadata as an empty cart", () => {
    expect(
      getCartItemKeys({
        partner: "Demo Clinic",
        notes: "Urgent",
        [ANNOUNCEMENT_DISMISSAL_KEY]: "bulk-order-workflow-v2",
      })
    ).toEqual([]);
  });

  it("returns persisted inventory item keys", () => {
    expect(
      getCartItemKeys({ partner: "Demo Clinic", notes: "", "22-1287": "{}" })
    ).toEqual(["22-1287"]);
  });
});

describe("Cart availability checks", () => {
  it("defers the availability request until the user submits the cart", async () => {
    const user = userEvent.setup();
    seedDemoCart();
    const fetchSpy = mockBackend();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart();

    expect(fetchSpy).not.toHaveBeenCalled();
    await fillPatientCounts(user, "1", "0");
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(callsTo(fetchSpy, "/api/inventory/availability")).toHaveLength(1)
    );
  });

  it("checks multiple items in one request and reports unavailable ones", async () => {
    const fetchSpy = mockBackend({ unavailableIds: ["23-1689"] });

    const result = await checkCartItemAvailability(["22-1287", "23-1689"]);

    const calls = callsTo(fetchSpy, "/api/inventory/availability");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body)).toEqual({
      itemIds: ["22-1287", "23-1689"],
    });
    expect(result.unavailableIds).toEqual(["23-1689"]);
    expect(result.failedIds).toEqual([]);
    expect(result.statuses).toEqual({ "22-1287": "done", "23-1689": "done" });
  });

  it("ignores empty ids and sends each id only once", async () => {
    const fetchSpy = mockBackend();

    await checkCartItemAvailability(["22-1287", "", null, "22-1287"]);

    const calls = callsTo(fetchSpy, "/api/inventory/availability");
    expect(JSON.parse(calls[0][1].body)).toEqual({ itemIds: ["22-1287"] });
  });

  it("checks carts over 100 items in sequential batches and merges the results", async () => {
    const itemIds = Array.from({ length: 101 }, (_, index) => `ITEM-${index + 1}`);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) => {
        const { itemIds: batch } = JSON.parse(options.body);
        // Mark the last id of each batch as unavailable.
        return {
          ok: true,
          status: 200,
          json: async () => ({ unavailableIds: [batch[batch.length - 1]] }),
        };
      });

    const result = await checkCartItemAvailability(itemIds);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const batches = fetchSpy.mock.calls.map(
      ([, options]) => JSON.parse(options.body).itemIds
    );
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toEqual(["ITEM-101"]);
    expect(result.unavailableIds).toEqual(["ITEM-100", "ITEM-101"]);
    expect(result.failedIds).toEqual([]);
  });

  it("fails closed when availability cannot be verified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const result = await checkCartItemAvailability(["22-1287"]);

    expect(result.unavailableIds).toEqual([]);
    expect(result.failedIds).toEqual(["22-1287"]);
    expect(result.statuses["22-1287"]).toBe("error");
  });
});

// NOTE: createRequestFields is no longer used by Cart (the backend builds the
// Airtable fields now). These tests still pass, but the function and its tests
// can be deleted together.
describe("Requests payload", () => {
  const baseInput = {
    requestName: "#ABC123",
    itemIds: ["22-1287"],
    notes: "Urgent",
    numOfPatients: "2",
    numOfChildren: "1",
  };

  it("writes linked Partner and Clinician record IDs", () => {
    const fields = createRequestFields({
      ...baseInput,
      requestParty: {
        partnerId: "recPartner",
        partnerName: "Stepping into Grace",
        clinicianRequired: true,
        clinicianId: "recClinician",
        clinicianName: "Alex Morgan",
      },
    });

    expect(fields.Partner).toEqual(["recPartner"]);
    expect(fields.Clinician).toEqual(["recClinician"]);
    expect(fields).not.toHaveProperty("Clinicians");
  });

  it("omits Clinician for a partner without mappings", () => {
    const fields = createRequestFields({
      ...baseInput,
      requestParty: demoParty,
    });

    expect(fields.Partner).toEqual(["recDemoClinic"]);
    expect(fields).not.toHaveProperty("Clinician");
    expect(fields).not.toHaveProperty("Clinicians");
  });
});

describe("Cart checkout", () => {
  it("sends the selected partner and clinician in the POST /api/requests body", async () => {
    const user = userEvent.setup();
    const setSelectedPartner = vi.fn();
    localStorage.setItem("partner", "Stepping into Grace");
    setRequestParty({
      partnerId: "recPartner",
      partnerName: "Stepping into Grace",
      clinicianRequired: true,
      clinicianId: "recClinician",
      clinicianName: "Alex Morgan",
    });
    localStorage.setItem(
      "22-1287",
      JSON.stringify({
        "Item ID": "22-1287",
        "Description (from SKU)": ["Demo Item"],
      })
    );
    // A stale master-list cache that must be invalidated after a successful request.
    sessionStorage.setItem("allInventoryItems", "[]");

    let requestBody;
    mockBackend({ onRequest: (body) => (requestBody = body) });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart({
      selectedPartner: "Stepping into Grace",
      setSelectedPartner,
    });

    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ResetCart" })).toHaveTextContent(
      "Clear"
    );
    await user.click(screen.getByRole("button", { name: "ResetCart" }));
    expect(
      screen.getByText("Are you sure you want to clear your cart?")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await fillPatientCounts(user, "2", "1");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(requestBody).toBeDefined());
    expect(requestBody).toEqual(
      expect.objectContaining({
        partnerId: "recPartner",
        clinicianId: "recClinician",
        itemIds: ["22-1287"],
        numOfPatients: 2,
        numOfChildren: 1,
      })
    );

    // Success clears the cart and the stale inventory cache...
    await waitFor(() => expect(localStorage.getItem("22-1287")).toBeNull());
    expect(sessionStorage.getItem("allInventoryItems")).toBeNull();
    // ...but keeps the request party for the next order.
    expect(getRequestParty()).toEqual({
      partnerId: "recPartner",
      partnerName: "Stepping into Grace",
      clinicianRequired: true,
      clinicianId: "recClinician",
      clinicianName: "Alex Morgan",
    });
    expect(localStorage.getItem("partner")).toBe("Stepping into Grace");
    expect(setSelectedPartner).not.toHaveBeenCalledWith("");
  });

  it("sends clinicianId as null for a partner without clinician", async () => {
    const user = userEvent.setup();
    seedDemoCart();
    let requestBody;
    mockBackend({ onRequest: (body) => (requestBody = body) });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart();
    await fillPatientCounts(user, "3", "0");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(requestBody).toBeDefined());
    expect(requestBody.partnerId).toBe("recDemoClinic");
    expect(requestBody.clinicianId).toBeNull();
  });

  it("preserves checkout state when the request write fails", async () => {
    const user = userEvent.setup();
    seedDemoCart();
    mockBackend({ requestResult: { ok: false, status: 500 } });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart();

    await fillPatientCounts(user, "4", "0");
    await user.type(screen.getByLabelText(/Additional notes/i), "Keep this work");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByLabelText(/How many patients do you plan to help/i)
    ).toHaveValue(4);
    expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Additional notes/i)).toHaveValue("Keep this work");
    expect(localStorage.getItem("22-1287")).not.toBeNull();
    expect(getRequestParty()).not.toBeNull();
  });

  it("keeps the cart when the backend answers 409 (items taken meanwhile)", async () => {
    const user = userEvent.setup();
    seedDemoCart();
    sessionStorage.setItem("allInventoryItems", "[]");
    const fetchSpy = mockBackend({
      requestResult: { ok: false, status: 409 },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart();
    await fillPatientCounts(user, "2", "1");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(callsTo(fetchSpy, "/api/requests")).toHaveLength(1)
    );
    expect(await screen.findByRole("heading", { name: "Cart" })).toBeInTheDocument();
    expect(localStorage.getItem("22-1287")).not.toBeNull();
    // The cache is only invalidated on success.
    expect(sessionStorage.getItem("allInventoryItems")).toBe("[]");
  });

  it("does not create the request when an item is no longer available", async () => {
    const user = userEvent.setup();
    seedDemoCart();
    const fetchSpy = mockBackend({ unavailableIds: ["22-1287"] });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart();
    await fillPatientCounts(user, "2", "1");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(callsTo(fetchSpy, "/api/inventory/availability")).toHaveLength(1)
    );
    expect(callsTo(fetchSpy, "/api/requests")).toHaveLength(0);
    expect(localStorage.getItem("22-1287")).not.toBeNull();
    // With an unavailable item, the request can't be submitted until it's removed.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled()
    );
  });

  it("does not create the request when availability cannot be verified", async () => {
    const user = userEvent.setup();
    seedDemoCart();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderCart();
    await fillPatientCounts(user, "2", "1");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(callsTo(fetchSpy, "/api/requests")).toHaveLength(0);
    expect(localStorage.getItem("22-1287")).not.toBeNull();
  });

  it("redirects a legacy partner-only session to Partner selection", async () => {
    localStorage.setItem("partner", "Stepping into Grace");

    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <PentaContext.Provider
          value={{
            inventoryGroups: [],
            selectedPartner: "Stepping into Grace",
            setSelectedPartner: vi.fn(),
            setCartCount: vi.fn(),
          }}
        >
          <Routes>
            <Route path="/cart" element={<Cart />} />
            <Route path="/partner" element={<p>Choose request partner</p>} />
          </Routes>
        </PentaContext.Provider>
      </MemoryRouter>,
      { withProviders: false }
    );

    expect(await screen.findByText("Choose request partner")).toBeInTheDocument();
  });
});

describe("Cart request context", () => {
  it("requires both patient counts before enabling the request", async () => {
    const user = userEvent.setup();
    seedDemoCart();

    renderCart();

    const patientsInput = screen.getByLabelText(
      /How many patients do you plan to help/i
    );
    const childrenInput = screen.getByLabelText(
      /How many of the patients are children/i
    );
    const submitButton = screen.getByRole("button", { name: "Confirm" });

    expect(patientsInput).toBeRequired();
    expect(childrenInput).toBeRequired();
    expect(submitButton).toBeDisabled();

    await user.type(patientsInput, "3");
    expect(submitButton).toBeDisabled();

    await user.type(childrenInput, "0");
    expect(submitButton).toBeEnabled();
  });

  it("preserves Partner and Clinician when the cart is cleared", async () => {
    const user = userEvent.setup();
    const requestParty = {
      partnerId: "recSteppingIntoGrace",
      partnerName: "Stepping into Grace",
      clinicianRequired: true,
      clinicianId: "recClinicianA",
      clinicianName: "Alex Morgan",
    };
    localStorage.setItem("partner", requestParty.partnerName);
    setRequestParty(requestParty);
    localStorage.setItem(
      "22-1287",
      JSON.stringify({
        "Item ID": "22-1287",
        "Description (from SKU)": ["Demo Item"],
      })
    );

    const Harness = () => {
      const [selectedPartner, setSelectedPartner] = useState(
        requestParty.partnerName
      );
      return (
        <PentaContext.Provider
          value={{
            inventoryGroups: [],
            selectedPartner,
            setSelectedPartner,
            setCartCount: vi.fn(),
          }}
        >
          <Routes>
            <Route path="/cart" element={<Cart />} />
            <Route path="/" element={<Link to="/cart">Open cart</Link>} />
          </Routes>
        </PentaContext.Provider>
      );
    };

    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <Harness />
      </MemoryRouter>,
      { withProviders: false }
    );

    await user.click(screen.getByRole("button", { name: "ResetCart" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(getCartItemKeys()).toEqual([]);
    expect(getRequestParty()).toEqual(requestParty);
    expect(localStorage.getItem("partner")).toBe(requestParty.partnerName);

    await user.click(screen.getByRole("link", { name: "Open cart" }));
    expect(
      screen.getByRole("heading", { name: "Your cart is empty" })
    ).toBeInTheDocument();
  });

  it("edits Partner and Clinician in place without losing cart items", async () => {
    const user = userEvent.setup();
    const item = {
      "Item ID": "22-1287",
      "Description (from SKU)": ["Demo Item"],
    };
    localStorage.setItem("partner", "Stepping into Grace");
    localStorage.setItem(item["Item ID"], JSON.stringify(item));
    setRequestParty({
      partnerId: "recSteppingIntoGrace",
      partnerName: "Stepping into Grace",
      clinicianRequired: true,
      clinicianId: "recClinicianA",
      clinicianName: "Alex Morgan",
    });

        // GET /api/lists/partners -> [{ id, label, clinicians: [{ id, label }] }]
    const partnersResponse = [
      {
        id: "recF5bBGGYd4Oezt4",
        label: "2ft Prosthetics",
        clinicians: [],
      },
      {
        id: "recSteppingIntoGrace",
        label: "Stepping into Grace",
        clinicians: [
          { id: "recClinicianA", label: "Alex Morgan" },
          { id: "recClinicianB", label: "Sam Rivera" },
        ],
      },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/api/lists/partners")) {
        return { ok: true, json: async () => partnersResponse };
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const Harness = () => {
      const [selectedPartner, setSelectedPartner] = useState(
        "Stepping into Grace"
      );
      return (
        <PentaContext.Provider
          value={{
            inventoryGroups: [],
            selectedPartner,
            setSelectedPartner,
            setCartCount: vi.fn(),
          }}
        >
          <Cart />
        </PentaContext.Provider>
      );
    };

    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <Harness />
      </MemoryRouter>,
      { withProviders: false }
    );

    await user.click(
      screen.getByRole("button", { name: "Change partner clinic" })
    );
    expect(
      await screen.findByRole("heading", { name: "Select partner clinic" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("PartnerDropdown")).toHaveValue(
      "Stepping into Grace"
    );
    expect(screen.getByLabelText("ClinicianDropdown")).toHaveValue(
      "Alex Morgan"
    );

    await user.click(screen.getByLabelText("PartnerDropdown"));
    await user.click(await screen.findByText("2ft Prosthetics"));
    expect(screen.queryByLabelText("ClinicianDropdown")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Save partner clinic" })
    );

    expect(
      screen.queryByRole("heading", { name: "Select partner clinic" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
    expect(screen.getByText("2ft Prosthetics")).toBeInTheDocument();
    expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
    expect(localStorage.getItem(item["Item ID"])).not.toBeNull();
    expect(getRequestParty()).toEqual({
      partnerId: "recF5bBGGYd4Oezt4",
      partnerName: "2ft Prosthetics",
      clinicianRequired: false,
      clinicianId: null,
      clinicianName: null,
    });
  });

  it("shows a focused empty state instead of request controls", () => {
    localStorage.setItem("partner", "Demo Clinic");
    setRequestParty(demoParty);

    renderCart();

    expect(
      screen.getByRole("heading", { name: "Your cart is empty" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Browse inventory" })
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/How many patients do you plan to help/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ResetCart" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });
});