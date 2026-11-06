// The Parts filter and the lower-leg diagram are only shown when the Extremity
// filter is set to "Lower". Orthosis items aren't split by extremity, so the
// Extremity filter is hidden and forced back to "All" while Orthosis is active.
// These tests drive the real drawer flow to verify that.
import { describe, it, expect } from "vitest";
import { useContext, useEffect } from "react";
import { renderWithProviders, screen, userEvent } from "../test/utils";
import PentaContext from "../context/PentaContext";
import SideBar from "./SideBar";

// Opens the drawer on mount via the real context so the sidebar content renders
// (the drawer is closed by default and has no trigger of its own in this test).
function OpenSidebar() {
  const { setIsSideBarActive } = useContext(PentaContext);
  useEffect(() => {
    setIsSideBarActive(true);
  }, [setIsSideBarActive]);
  return null;
}

const renderSidebar = () => {
  const user = userEvent.setup();
  renderWithProviders(
    <>
      <OpenSidebar />
      <SideBar />
    </>
  );
  return user;
};

describe("SideBar Parts + leg diagram gating", () => {
  it("shows Parts and the leg diagram only for the Lower extremity", async () => {
    const user = renderSidebar();

    // Drawer open -> choose an assistive device, then the Lower extremity.
    await user.click(await screen.findByRole("button", { name: "Prosthesis" }));
    await user.click(await screen.findByRole("button", { name: "Lower" }));

    // Parts (a unique option) and the diagram are both present for Lower.
    expect(screen.getByRole("button", { name: "Liners" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /lower extremity/i })
    ).toBeInTheDocument();

    // Bidirectional: clicking a leg part selects the matching Parts filter.
    await user.click(screen.getByRole("button", { name: "Select Feet" }));
    expect(screen.getByRole("button", { name: "Feet" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Switching to Upper hides both again.
    await user.click(screen.getByRole("button", { name: "Upper" }));
    expect(
      screen.queryByRole("button", { name: "Liners" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /lower extremity/i })
    ).not.toBeInTheDocument();
  });

  it("resets the selected part when leaving and re-entering Lower", async () => {
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Prosthesis" }));
    await user.click(await screen.findByRole("button", { name: "Lower" }));

    // Select a part, then leave Lower (selectedPart is cleared)...
    await user.click(screen.getByRole("button", { name: "Select Feet" }));
    expect(screen.getByRole("button", { name: "Feet" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: "Upper" }));

    // ...coming back, the previous part is no longer selected (defaults to "All").
    await user.click(screen.getByRole("button", { name: "Lower" }));
    expect(screen.getByRole("button", { name: "Feet" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("hides Extremity, Parts and the leg diagram when Orthosis is active", async () => {
    const user = renderSidebar();

    // Start from Prosthesis + Lower so Parts and the diagram are visible.
    await user.click(await screen.findByRole("button", { name: "Prosthesis" }));
    await user.click(await screen.findByRole("button", { name: "Lower" }));
    expect(screen.getByRole("button", { name: "Liners" })).toBeInTheDocument();

    // Switching to Orthosis forces extremity back to "All":
    // Parts + diagram disappear, and so do the Extremity options.
    await user.click(screen.getByRole("button", { name: "Orthosis" }));

    expect(
      screen.queryByRole("button", { name: "Liners" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /lower extremity/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lower" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upper" })
    ).not.toBeInTheDocument();

    // Going back to Prosthesis does not restore the old Lower selection:
    // extremity stays "All", so Parts + diagram remain hidden.
    await user.click(screen.getByRole("button", { name: "Prosthesis" }));
    expect(
      screen.queryByRole("button", { name: "Liners" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /lower extremity/i })
    ).not.toBeInTheDocument();
  });
});