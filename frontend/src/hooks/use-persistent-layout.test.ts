import { describe, it, expect, beforeEach, vi } from "vitest";
import { readPreferences } from "./use-persistent-layout";
const key = "constellation.layout.v2";
// Vitest는 node 환경에서 돈다. Storage 인터페이스 중 훅이 쓰는 부분만 흉내 낸다.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
});
describe("persisted layout", () => {
  beforeEach(() => localStorage.clear());
  it("falls back to an open nav and a selection-driven inspector", () => {
    expect(readPreferences(false)).toEqual({ navOpen: true, detailOpen: false });
    expect(readPreferences(true)).toEqual({ navOpen: true, detailOpen: true });
  });
  it("ignores broken and v1 values", () => {
    localStorage.setItem(key, "{broken");
    expect(readPreferences(true)).toEqual({ navOpen: true, detailOpen: true });
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, navOpen: false, detailOpen: true }),
    );
    expect(readPreferences(false)).toEqual({
      navOpen: true,
      detailOpen: false,
    });
  });
  it("restores v2 booleans and fills missing ones", () => {
    localStorage.setItem(key, JSON.stringify({ version: 2, navOpen: false }));
    expect(readPreferences(true)).toEqual({ navOpen: false, detailOpen: true });
    localStorage.setItem(
      key,
      JSON.stringify({ version: 2, navOpen: "yes", detailOpen: false }),
    );
    expect(readPreferences(true)).toEqual({ navOpen: true, detailOpen: false });
  });
});
