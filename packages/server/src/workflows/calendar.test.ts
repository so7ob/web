import { describe, it, expect } from "vitest";
import { businessDeadline } from "./calendar.js";
import {
  calendarSchema,
  legacyWorkflow,
  validateWorkflow,
  matchesConditions,
  type BusinessCalendar,
} from "@so7ob/contracts";
const calendar: BusinessCalendar = {
  timezone: "Asia/Aden",
  week: [
    [],
    [
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "16:00" },
    ],
    [{ start: "08:00", end: "16:00" }],
    [{ start: "08:00", end: "16:00" }],
    [{ start: "08:00", end: "16:00" }],
    [],
    [],
  ],
  exceptions: [{ date: "2026-10-13", intervals: [] }],
};
describe("versioned business calendar", () => {
  it("excludes breaks, holidays and weekends, and retains subminute precision", () => {
    expect(
      businessDeadline(
        new Date("2026-10-12T08:30:00.250Z"),
        2,
        calendar,
      ).toISOString(),
    ).toBe("2026-10-12T11:30:00.250Z");
    expect(
      businessDeadline(
        new Date("2026-10-12T12:00:00Z"),
        2,
        calendar,
      ).toISOString(),
    ).toBe("2026-10-14T06:00:00.000Z");
    expect(
      businessDeadline(
        new Date("2026-10-15T12:00:00Z"),
        2,
        calendar,
      ).toISOString(),
    ).toBe("2026-10-19T06:00:00.000Z");
  });
  it("uses actual instants across DST rather than adding wall-clock hours", () => {
    const c: BusinessCalendar = {
      timezone: "America/New_York",
      week: Array.from({ length: 7 }, () => [{ start: "00:00", end: "04:00" }]),
      exceptions: [],
    };
    expect(
      businessDeadline(new Date("2026-03-08T05:00:00Z"), 3, c).toISOString(),
    ).toBe("2026-03-08T08:00:00.000Z");
    expect(
      businessDeadline(new Date("2026-11-01T04:00:00Z"), 5, c).toISOString(),
    ).toBe("2026-11-01T09:00:00.000Z");
  });
  it("rejects empty, overlapping and invalid-zone calendars", () => {
    expect(
      calendarSchema.safeParse({
        ...calendar,
        week: Array.from({ length: 7 }, () => []),
      }).success,
    ).toBe(false);
    expect(
      calendarSchema.safeParse({ ...calendar, timezone: "bad/timezone" })
        .success,
    ).toBe(false);
    expect(
      calendarSchema.safeParse({
        ...calendar,
        week: Array.from({ length: 7 }, () => [
          { start: "09:00", end: "12:00" },
          { start: "11:00", end: "13:00" },
        ]),
      }).success,
    ).toBe(false);
  });
});
it("checks graph reachability, closure and destination configuration", () => {
  const d = legacyWorkflow("requests");
  expect(validateWorkflow(d)).toEqual([]);
  d.stages.push({ ...d.stages[0], id: "orphan" });
  expect(validateWorkflow(d)).toContain("unreachable_stage");
  d.stages[0].routing.mode = "round_robin";
  expect(validateWorkflow(d)).toContain("routing_team");
});
it("evaluates only allowlisted structured conditions", () => {
  expect(
    matchesConditions(
      {
        match: "all",
        conditions: [
          { field: "priority", op: "in", value: "high,urgent" },
          { field: "assigneeId", op: "empty", value: "" },
        ],
      },
      { priority: "urgent", assigneeId: null },
    ),
  ).toBe(true);
  expect(
    matchesConditions(
      {
        match: "any",
        conditions: [{ field: "priority", op: "eq", value: "urgent" }],
      },
      { priority: "normal" },
    ),
  ).toBe(false);
});
