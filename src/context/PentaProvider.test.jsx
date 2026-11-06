// buildInventoryParams (in PentaProvider) builds the query params sent to the
// inventory API. The Airtable filterByFormula is now built server-side, so these
// tests verify the params object: user filters are mapped correctly, SKU
// constraints and page size pass through, and includeUserFilters=false drops
// every user-selected filter.
import { describe, it, expect } from "vitest";
import { useContext, useEffect } from "react";
import { renderWithProviders, screen, waitFor } from "../test/utils";
import PentaContext from "./PentaContext";

const readParams = (testId) =>
  JSON.parse(screen.getByTestId(testId).textContent);

function PartProbe({ part }) {
  const { buildInventoryParams, setSelectedPart } = useContext(PentaContext);
  useEffect(() => {
    setSelectedPart(part);
  }, [part, setSelectedPart]);
  return (
    <div data-testid="params">{JSON.stringify(buildInventoryParams())}</div>
  );
}

function ExtremityProbe({ extremity }) {
  const { buildInventoryParams, setExtremity, setSelectedFilters } =
    useContext(PentaContext);
  useEffect(() => {
    setExtremity(extremity);
    setSelectedFilters((prev) => ({ ...prev, Prosthesis: true }));
  }, [extremity, setExtremity, setSelectedFilters]);
  return (
    <div data-testid="params">{JSON.stringify(buildInventoryParams())}</div>
  );
}

function MasterProbe() {
  const {
    buildInventoryParams,
    setSelectedManufacturer,
    setSearchInput,
  } = useContext(PentaContext);
  useEffect(() => {
    setSelectedManufacturer([
      {
        label: "Freedom Innovation",
        value: encodeURIComponent("Freedom Innovation"),
      },
    ]);
    setSearchInput("pylon");
  }, [setSelectedManufacturer, setSearchInput]);
  return (
    <>
      <div data-testid="filtered">
        {JSON.stringify(buildInventoryParams())}
      </div>
      <div data-testid="master">
        {JSON.stringify(buildInventoryParams({ includeUserFilters: false }))}
      </div>
    </>
  );
}

function GroupProbe() {
  const { buildInventoryParams } = useContext(PentaContext);
  return (
    <div data-testid="group-params">
      {JSON.stringify(
        buildInventoryParams({
          pageSize: 12,
          includeSkuCodes: ["AAFO", "ABL"],
          excludeSkuCodes: ["ADB-M"],
        })
      )}
    </div>
  );
}

describe("buildInventoryParams part filter", () => {
  it.each(["Feet", "Knees/Hips", "Accessories"])(
    "passes the %s part through as the part param",
    async (part) => {
      renderWithProviders(<PartProbe part={part} />);
      await waitFor(() => expect(readParams("params").part).toBe(part));
    }
  );

  it("sends no part param when nothing is selected", () => {
    renderWithProviders(<PartProbe part="" />);
    expect(readParams("params")).not.toHaveProperty("part");
  });
});

describe("buildInventoryParams extremity + tags", () => {
  it("sends extremity and tags when a specific extremity is chosen", async () => {
    renderWithProviders(<ExtremityProbe extremity="Lower" />);
    await waitFor(() => expect(readParams("params").extremity).toBe("Lower"));
    expect(readParams("params").tags).toEqual(["Prosthesis"]);
  });

  it("omits extremity when it is 'All'", async () => {
    renderWithProviders(<ExtremityProbe extremity="All" />);
    await waitFor(() => expect(readParams("params").tags).toEqual(["Prosthesis"]));
    expect(readParams("params")).not.toHaveProperty("extremity");
  });
});

describe("buildInventoryParams grouped inventory options", () => {
  it("adds SKU constraints and page size", () => {
    renderWithProviders(<GroupProbe />);
    const params = readParams("group-params");

    expect(params.pageSize).toBe(12);
    expect(params.includeSku).toEqual(["AAFO", "ABL"]);
    expect(params.excludeSku).toEqual(["ADB-M"]);
  });
});

describe("buildInventoryParams master list (includeUserFilters=false)", () => {
  it("drops user filters/search and keeps only the page size", async () => {
    renderWithProviders(<MasterProbe />);

    // Wait until the user filters are reflected in the default params.
    await waitFor(() =>
      expect(readParams("filtered").manufacturers).toEqual([
        "Freedom Innovation",
      ])
    );

    const filtered = readParams("filtered");
    const master = readParams("master");

    // The normal params apply the selected manufacturer (decoded) and search.
    expect(filtered.manufacturers).toEqual(["Freedom Innovation"]);
    expect(filtered.search).toBe("pylon");

    // The master-list params omit every user-selected filter and search.
    expect(master).not.toHaveProperty("manufacturers");
    expect(master).not.toHaveProperty("search");
    expect(master).toEqual({ pageSize: 36 });
  });
});