import { describe, expect, it } from "vitest";
import { validateDocx } from "../upload.js";

describe("validateDocx", () => {
  it("accepts a file with .docx extension", () => {
    expect(validateDocx("abc.docx")).toEqual({ ok: true });
  });

  it("accepts .docx with uppercase extension", () => {
    expect(validateDocx("报告.DOCX")).toEqual({ ok: true });
  });

  it("rejects a non-docx extension", () => {
    const result = validateDocx("notes.txt");
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatch(/docx/i);
  });

  it("rejects an empty filename", () => {
    const result = validateDocx("");
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatch(/docx/i);
  });
});
