import { describe, expect, it } from "vitest";
import { IDLE, isCancel, megabytes, NO_UPDATES, percent, updateState, type UpdateStatus } from "./update";

const found = { version: "2.2.0", build: 2_002_000, url: "https://github.com/x", notes: "", publishedAt: null };
const base: UpdateStatus = { ...NO_UPDATES, available: true, current: "2.1.0" };

describe("update row state", () => {
  it("is inert without a verification key", () => {
    expect(updateState(NO_UPDATES)).toBe("unavailable");
    expect(updateState({ ...base, available: false, update: found })).toBe("unavailable");
  });

  it("tells a found update, a current build and a first run apart", () => {
    expect(updateState({ ...base, lastChecked: 5, update: found })).toBe("found");
    expect(updateState({ ...base, lastChecked: 5 })).toBe("current");
    expect(updateState(base)).toBe("unchecked");
  });
});

describe("install progress", () => {
  it("counts whole percent and never passes 100", () => {
    expect(percent(IDLE)).toBe(0);
    expect(percent({ phase: "downloading", downloaded: 37, total: 100 })).toBe(37);
    expect(percent({ phase: "downloading", downloaded: 999, total: 998 })).toBe(100);
    expect(megabytes({ phase: "downloading", downloaded: 35_068_561, total: 94_779_896 })).toBe("35.1 / 94.8 MB");
  });

  it("does not report a cancel as a failure", () => {
    expect(isCancel("cancelled")).toBe(true);
    expect(isCancel("download failed: HTTP 404")).toBe(false);
  });
});
