import { resolveLocaleSelection, SYSTEM_LANGUAGE } from "@t3tools/client-runtime/locales";
import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../../i18n/locales";
import {
  adjustSnoozeDate,
  applySnoozePickerDate,
  snoozeDateToPickerDate,
  snoozePickerLabels,
} from "./customSnoozeDate";

describe("custom snooze calendar conversion", () => {
  it("passes the local calendar day to Compose without shifting it across time zones", () => {
    const date = new Date(2026, 8, 17, 0, 30);
    expect(snoozeDateToPickerDate(date)).toBe("2026-09-17T00:00:00.000Z");
  });

  it("applies Compose's UTC calendar day while retaining the local time", () => {
    const date = new Date(2026, 8, 16, 23, 45);
    const next = applySnoozePickerDate(date, new Date("2026-09-20T00:00:00Z"));
    expect([
      next.getFullYear(),
      next.getMonth(),
      next.getDate(),
      next.getHours(),
      next.getMinutes(),
    ]).toEqual([2026, 8, 20, 23, 45]);
    expect(date.getDate()).toBe(16);
  });

  it.each([
    { language: SYSTEM_LANGUAGE, catalog: "en", dateLabel: "5 May" },
    { language: "fr", catalog: "fr", dateLabel: "5 mai" },
  ])("labels the picked date and time for the $language preference", (test) => {
    const date = new Date(2027, 4, 5, 14, 30);
    const { catalogLocale, formattingLocale } = resolveLocaleSelection(
      test.language,
      ["it-IT", "en-GB"],
      SUPPORTED_LOCALES,
      DEFAULT_LOCALE,
    );
    expect(catalogLocale).toBe(test.catalog);
    expect(snoozePickerLabels(date, formattingLocale, true)).toEqual({
      date: test.dateLabel,
      time: "14:30",
    });
  });
});

it("steps calendar days across DST while preserving local time and steps clock fields through transitions", () => {
  vi.stubEnv("TZ", "America/New_York");
  try {
    const spring = new Date("2026-03-07T12:30:00-05:00");
    expect(adjustSnoozeDate(spring, "day", 1).toISOString()).toBe("2026-03-08T16:30:00.000Z");
    expect(spring.toISOString()).toBe("2026-03-07T17:30:00.000Z");
    expect(adjustSnoozeDate(new Date("2026-11-01T12:30:00-05:00"), "day", -1).toISOString()).toBe(
      "2026-10-31T16:30:00.000Z",
    );
    const springHour = new Date("2026-03-08T03:30:00-04:00");
    expect(adjustSnoozeDate(springHour, "hour", -1).toISOString()).toBe("2026-03-08T06:30:00.000Z");
    const fallHour = new Date("2026-11-01T01:30:00-04:00");
    expect(adjustSnoozeDate(fallHour, "hour", 1).toISOString()).toBe("2026-11-01T06:30:00.000Z");
    expect(adjustSnoozeDate(new Date("2026-12-31T23:59:00-05:00"), "minute", 1).toISOString()).toBe(
      "2027-01-01T05:00:00.000Z",
    );
    expect(adjustSnoozeDate(new Date("2028-02-28T12:30:00-05:00"), "day", 1).getDate()).toBe(29);
  } finally {
    vi.unstubAllEnvs();
  }
});
