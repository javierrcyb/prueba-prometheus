// The Partner page renders a title and a RequestPartyPicker (searchable shadcn Combobox) that loads
// partners (each with its clinicians) via GET /api/lists/partners.
// Selecting a partner (and a clinician, when the partner has any) enables the submit button.
// On submit the page persists the request party, updates PentaContext and navigates to /cart.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "../test/utils";
import Partner from "./Partner";
import PentaContext from "../context/PentaContext";
import { server } from "../test/mocks/server";
import { getRequestParty } from "../lib/storage";
import { API_URL } from "../config/api";

const PARTNERS_URL = `${API_URL}/api/lists/partners`;

// The button keeps the picker's default aria-label; "Continue to cart" is only its visible text.
const SUBMIT_NAME = "SubmitPartner";

import { getRequestParties } from "../lib/api";

it("debug", async () => {
  console.log(await getRequestParties("partners"));
});

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

const setSelectedPartner = vi.fn();

const renderPartner = () =>
  renderWithProviders(
    <PentaContext.Provider value={{ setSelectedPartner }}>
      <Partner />
    </PentaContext.Provider>
  );

  it("debug partners endpoint", async () => {
  console.log("API_URL =", API_URL);
  try {
    const res = await fetch(`${API_URL}/api/lists/partners`);
    console.log("status =", res.status);
    console.log("body =", JSON.stringify(await res.text()));
  } catch (e) {
    console.log("fetch threw:", e.message);
  }
});

describe("Partner page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    setSelectedPartner.mockClear();
    localStorage.clear();
  });

  it("renders the page title and the submit button label", async () => {
    renderPartner();

    expect(
      screen.getByRole("heading", { name: "Select Partner To View Cart" })
    ).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Select a Partner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT_NAME })).toHaveTextContent(
      "Continue to cart"
    );
  });

  it("lists the partner names returned by the backend", async () => {
    const user = userEvent.setup();
    renderPartner();

    await user.click(await screen.findByPlaceholderText("Select a Partner"));

    expect(await screen.findByText("Mitch Dobson")).toBeInTheDocument();
    expect(screen.getByText("2ft Prosthetics")).toBeInTheDocument();
    expect(screen.getByText("Healing Hands for Haiti")).toBeInTheDocument();
    expect(screen.getByText("Stepping into Grace")).toBeInTheDocument();
  });

  it("selecting a partner without clinicians enables the submit button", async () => {
    const user = userEvent.setup();
    renderPartner();

    const input = await screen.findByPlaceholderText("Select a Partner");
    const submit = screen.getByRole("button", { name: SUBMIT_NAME });
    expect(submit).toBeDisabled();

    await user.click(input);
    await user.click(await screen.findByText("2ft Prosthetics"));

    expect(submit).toBeEnabled();
    expect(screen.queryByLabelText("ClinicianDropdown")).not.toBeInTheDocument();
  });

  it("shows the selected partner in the combobox input", async () => {
    const user = userEvent.setup();
    renderPartner();

    const input = await screen.findByPlaceholderText("Select a Partner");
    await user.click(input);
    await user.click(await screen.findByText("2ft Prosthetics"));

    expect(input).toHaveValue("2ft Prosthetics");
  });

  it("renders no options when the partners list is empty", async () => {
    const user = userEvent.setup();
    server.use(http.get(PARTNERS_URL, () => HttpResponse.json([])));

    renderPartner();

    const input = await screen.findByPlaceholderText("Select a Partner");
    await user.click(input);

    expect(await screen.findByText("No partners found.")).toBeInTheDocument();
    expect(screen.queryByText("Mitch Dobson")).not.toBeInTheDocument();
    expect(screen.queryByText("2ft Prosthetics")).not.toBeInTheDocument();
  });

  it("requires a clinician when the partner has clinicians", async () => {
    const user = userEvent.setup();
    renderPartner();

    await user.click(await screen.findByPlaceholderText("Select a Partner"));
    await user.click(await screen.findByText("Stepping into Grace"));

    const clinicianInput = screen.getByPlaceholderText("Select a Clinician");
    const submit = screen.getByRole("button", { name: SUBMIT_NAME });
    expect(clinicianInput).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.click(clinicianInput);
    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    await user.click(screen.getByText("Alex Morgan"));

    expect(submit).toBeEnabled();
  });

  it("clears the clinician when the partner changes", async () => {
    const user = userEvent.setup();
    renderPartner();

    const partnerInput = await screen.findByPlaceholderText("Select a Partner");
    await user.click(partnerInput);
    await user.click(await screen.findByText("Stepping into Grace"));
    await user.click(screen.getByPlaceholderText("Select a Clinician"));
    await user.click(await screen.findByText("Alex Morgan"));

    await user.click(partnerInput);
    await user.click(await screen.findByText("2ft Prosthetics"));

    expect(screen.queryByLabelText("ClinicianDropdown")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT_NAME })).toBeEnabled();
  });

  it("persists linked Partner and Clinician record IDs, updates context and navigates to the cart", async () => {
    const user = userEvent.setup();
    renderPartner();

    await user.click(await screen.findByPlaceholderText("Select a Partner"));
    await user.click(await screen.findByText("Stepping into Grace"));
    await user.click(screen.getByPlaceholderText("Select a Clinician"));
    await user.click(await screen.findByText("Jordan Lee"));
    await user.click(screen.getByRole("button", { name: SUBMIT_NAME }));

    expect(getRequestParty()).toEqual({
      partnerId: "recSteppingIntoGrace",
      partnerName: "Stepping into Grace",
      clinicianRequired: true,
      clinicianId: "recClinicianB",
      clinicianName: "Jordan Lee",
    });
    expect(localStorage.getItem("partner")).toBe("Stepping into Grace");
    expect(setSelectedPartner).toHaveBeenCalledWith("Stepping into Grace");
    expect(mockNavigate).toHaveBeenCalledWith("/cart");
  });

  it("submits a partner that does not need a clinician", async () => {
    const user = userEvent.setup();
    renderPartner();

    await user.click(await screen.findByPlaceholderText("Select a Partner"));
    await user.click(await screen.findByText("2ft Prosthetics"));
    await user.click(screen.getByRole("button", { name: SUBMIT_NAME }));

    expect(getRequestParty()).toEqual({
      partnerId: "recF5bBGGYd4Oezt4",
      partnerName: "2ft Prosthetics",
      clinicianRequired: false,
      clinicianId: null,
      clinicianName: null,
    });
    expect(localStorage.getItem("partner")).toBe("2ft Prosthetics");
    expect(setSelectedPartner).toHaveBeenCalledWith("2ft Prosthetics");
    expect(mockNavigate).toHaveBeenCalledWith("/cart");
  });

it("does not navigate if saving to localStorage fails", async () => {
  const user = userEvent.setup();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const realSetItem = Storage.prototype.setItem;
  const setItem = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (key, value) {
      if (key === "partner") throw new Error("quota exceeded");
      return realSetItem.call(this, key, value);
    });

  try {
    renderPartner();

    await user.click(await screen.findByPlaceholderText("Select a Partner"));
    await user.click(await screen.findByText("2ft Prosthetics"));
    await user.click(screen.getByRole("button", { name: SUBMIT_NAME }));

    expect(consoleError).toHaveBeenCalledWith(
      "Error updating local storage:",
      expect.any(Error)
    );
    expect(setSelectedPartner).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  } finally {
    setItem.mockRestore();
    consoleError.mockRestore();
  }
});

  it("recovers when Retry succeeds", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });
    server.use(
      http.get(PARTNERS_URL, () => new HttpResponse(null, { status: 500 }), {
        once: true,
      })
    );

    renderPartner();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    const input = await screen.findByPlaceholderText("Select a Partner");
    expect(input).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(input);
    expect(await screen.findByText("Mitch Dobson")).toBeInTheDocument();

    consoleError.mockRestore();
  });
});