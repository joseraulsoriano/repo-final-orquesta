import { describe, expect, it } from "vitest";
import { parseJsonLoose } from "./parseJson";

describe("parseJsonLoose", () => {
  it("parses clean JSON", () => {
    expect(parseJsonLoose('{"speech":"hola"}')).toEqual({ speech: "hola" });
  });

  it("extracts JSON from fenced text", () => {
    const raw = 'Aquí va:\n```json\n{"action":"RECALL"}\n```';
    expect(parseJsonLoose(raw)).toEqual({ action: "RECALL" });
  });

  it("returns null for garbage", () => {
    expect(parseJsonLoose("sin json")).toBeNull();
  });
});
