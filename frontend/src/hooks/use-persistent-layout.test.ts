import { describe, it, expect, beforeEach, vi } from "vitest";
import { readPreferences } from "./use-persistent-layout";
const key = "constellation.layout.v3";
// Vitest는 node 환경에서 돈다. Storage 인터페이스 중 훅이 쓰는 부분만 흉내 낸다.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
});
describe("persisted layout", () => {
  beforeEach(() => localStorage.clear());
  it("falls back to an open nav and a closed chat", () => {
    expect(readPreferences()).toEqual({ navOpen: true, chatOpen: false });
  });
  it("ignores broken and older values", () => {
    localStorage.setItem(key, "{broken");
    expect(readPreferences()).toEqual({ navOpen: true, chatOpen: false });
    localStorage.setItem(
      key,
      JSON.stringify({ version: 2, navOpen: false, detailOpen: true }),
    );
    expect(readPreferences()).toEqual({ navOpen: true, chatOpen: false });
  });
  it("restores v3 booleans and fills missing ones", () => {
    localStorage.setItem(key, JSON.stringify({ version: 3, navOpen: false }));
    expect(readPreferences()).toEqual({ navOpen: false, chatOpen: false });
    localStorage.setItem(
      key,
      JSON.stringify({ version: 3, navOpen: "yes", chatOpen: true }),
    );
    expect(readPreferences()).toEqual({ navOpen: true, chatOpen: true });
  });
});
