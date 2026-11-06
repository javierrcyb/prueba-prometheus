import { describe, expect, it } from "vitest";
import { readJsonBody } from "../src/lib/body.js";

const post = (body) => new Request("http://test/x", { method: "POST", body });

describe("readJsonBody", () => {
  it("returns a plain JSON object", async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ value: { a: 1 } });
  });

  it.each([
    ["invalid JSON", "{oops"],
    ["an empty body", ""],
  ])("rejects %s with 400", async (_name, text) => {
    expect(await readJsonBody(post(text))).toEqual({
      error: "Body must be valid JSON",
      status: 400,
    });
  });

  it.each([
    ["an array", "[1]"],
    ["a string", '"hello"'],
    ["null", "null"],
    ["a number", "5"],
  ])("rejects %s with 400", async (_name, text) => {
    expect(await readJsonBody(post(text))).toEqual({
      error: "Body must be a JSON object",
      status: 400,
    });
  });

  it("rejects a body that is too large with 413", async () => {
    const tooBig = JSON.stringify({ notes: "x".repeat(20001) });

    expect(await readJsonBody(post(tooBig))).toEqual({
      error: "Body is too large",
      status: 413,
    });
  });
});
