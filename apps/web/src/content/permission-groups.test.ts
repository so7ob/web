import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG } from "@so7ob/contracts";
import { permissionGroupLabel } from "./permission-groups";

describe("permission group headings", () => {
  it("translates every current group, including workflows and teams", () => {
    for (const group of new Set(PERMISSION_CATALOG.map(p => p.group))) {
      expect(permissionGroupLabel(group, "ar")).toMatch(/[\u0600-\u06ff]/);
      expect(permissionGroupLabel(group, "en")).toBe(group);
    }
  });
  it("keeps an unknown future group visible in both languages", () => {
    expect(permissionGroupLabel("future-group", "ar")).toBe("future-group");
    expect(permissionGroupLabel("future-group", "en")).toBe("future-group");
  });
});
