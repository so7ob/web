import { expect, it } from "vitest";
import { decodePublicStage } from "./access.js";

const stage = { nameAr: "مراجعة 😀", nameEn: "Review", status: "in_review" };
it("decodes a public SQL stage from text, an object or SQL NULL", () => {
  expect(decodePublicStage(JSON.stringify(stage))).toEqual(stage);
  expect(decodePublicStage(stage)).toEqual(stage);
  expect(decodePublicStage(null)).toBeNull();
  expect(decodePublicStage({ ...stage, routing: "private", teamId: "private" })).toEqual(stage);
});
it("rejects malformed projections instead of silently dropping a stage", () => {
  for (const value of [undefined, "", "not JSON", "null", "[]", [], false, 0, { ...stage, nameEn: null }, { nameAr: "ناقص" }])
    expect(() => decodePublicStage(value)).toThrow();
});
