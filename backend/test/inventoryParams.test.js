
import { describe, expect, it } from "vitest";
import { parseInventoryParams } from "../src/lib/inventoryParams.js";
import { buildInventoryFormula, escapeFormulaString } from "../src/lib/formula.js";

// Builds the URL object the handler would receive.
const parse = (query) => parseInventoryParams(new URL(`http://test/api/inventory?${query}`));

describe("parseInventoryParams", () => {
  it("uses safe defaults when no parameters are sent", () => {
    const { value, error } = parse("");
    expect(error).toBeUndefined();
    expect(value.pageSize).toBe(36);
    expect(value.tags).toEqual([]);
    expect(value.part).toBeNull();
  });

  it.each(["0", "101", "abc", "-1", "1.5"])("rejects pageSize=%s", (size) => {
    expect(parse(`pageSize=${size}`).error).toMatch(/pageSize/);
  });

  it("reads repeated parameters as lists", () => {
    expect(parse("tags=Prosthesis&tags=Pediatric").value.tags).toEqual(["Prosthesis", "Pediatric"]);
  });

  it("does not split a description at its comma", () => {
    expect(parse("descriptions=Knee%2C+Hydraulic").value.descriptions).toEqual(["knee hydraulic"]);
  });

  it("accepts SKU codes that contain spaces", () => {
    expect(parse("excludeSku=Leg+Storage+Rack").error).toBeUndefined();
  });

  it("rejects unknown parameters", () => {
    expect(parse("foo=1").error).toBe("Unknown parameter");
  });

  it("rejects values outside the allowed lists", () => {
    expect(parse("tags=Nope").error).toMatch(/tags/);
    expect(parse("part=Nope").error).toMatch(/part/);
    expect(parse("extremity=Sideways").error).toMatch(/extremity/);
  });

  it("treats part=All and extremity=All as no filter", () => {
    const { value } = parse("part=All&extremity=All");
    expect(value.part).toBeNull();
    expect(value.extremity).toBeNull();
  });

  it("needs minSize and maxSize together, in order", () => {
    expect(parse("minSize=5").error).toMatch(/minSize and maxSize/);
    expect(parse("minSize=30&maxSize=10").error).toMatch(/minSize and maxSize/);
    expect(parse("minSize=10&maxSize=30").value).toMatchObject({ minSize: 10, maxSize: 30 });
  });

  it("rejects an offset with unsafe characters", () => {
    expect(parse("offset=abc%22def").error).toBe("offset is not valid");
    expect(parse("offset=itrABC123/recXYZ789").error).toBeUndefined();
  });

  it("limits the length of the search text", () => {
    expect(parse(`search=${"a".repeat(101)}`).error).toMatch(/search/);
  });
});

describe("buildInventoryFormula", () => {
  it("always includes the availability filters", () => {
    const formula = buildInventoryFormula(parse("").value);
    expect(formula).toContain("{Requests}=BLANK()");
    expect(formula).toContain("{Shipment Status}=BLANK()");
  });

  it("escapes quotes typed by the user so they cannot change the formula", () => {
    const { value } = parse(`search=${encodeURIComponent('x") , TRUE() , ("')}`);
    expect(buildInventoryFormula(value)).toContain('SEARCH("x\\")",{StringSearch})');
  });

  it("escapes backslashes and quotes", () => {
    expect(escapeFormulaString('a\\b"c')).toBe('a\\\\b\\"c');
  });

  it("translates Parts to Limb Guide values", () => {
    const formula = buildInventoryFormula(parse("part=Accessories").value);
    expect(formula).toContain('FIND("Accessory/ Misc.",ARRAYJOIN({Limb Guide}))');
  });
});
