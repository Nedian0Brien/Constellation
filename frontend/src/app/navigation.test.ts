import { describe, it, expect } from "vitest";
import { parseSearch, changeSearch } from "./navigation";
describe("URL navigation", () => {
  it("normalizes malformed values without crashing", () => {
    const s = parseSearch({
      view: "bad",
      page: -9,
      from: 2026,
      to: 2020,
      cluster: "oops",
      list: "true",
      q: "  검색  ",
    });
    expect(s.view).toBe("map");
    expect(s.page).toBe(1);
    expect(s.from).toBeUndefined();
    expect(s.cluster).toBeUndefined();
    expect(s.list).toBe(true);
    expect(s.q).toBe("검색");
  });
  it("invalidates only run-dependent selections on a model change", () => {
    const s = changeSearch(
      parseSearch({
        run: "a",
        selected: "paper",
        node: 4,
        from: 2020,
        q: "rag",
        list: true,
      }),
      { run: "b" },
    );
    expect(s.selected).toBeUndefined();
    expect(s.node).toBeUndefined();
    expect(s.from).toBeUndefined();
    expect(s.q).toBe("rag");
    expect(s.list).toBe(true);
  });
  it("keeps selection across views and resets paging after filters", () => {
    const s = parseSearch({ selected: "openalex:W1", page: 4 });
    expect(changeSearch(s, { view: "tree" }).selected).toBe(s.selected);
    expect(changeSearch(s, { q: "retrieval" }).page).toBe(1);
  });
  it("handles query objects and boolean numbers safely", () => {
    const s = parseSearch({
      q: { bad: 1 },
      page: true,
      from: null,
      to: "",
      selected: ["one"],
    });
    expect(s.q).toBe("");
    expect(s.selected).toBeUndefined();
    expect(s.page).toBe(1);
    expect(s.from).toBeUndefined();
  });
});

it("preserves a deep link when resolving the default run for the first time", () => {
  const s = changeSearch(
    parseSearch({ selected: "openalex:W1", node: 42, from: 2020, to: 2025 }),
    { run: "scincl" },
  );
  expect(s.selected).toBe("openalex:W1");
  expect(s.node).toBe(42);
  expect(s.from).toBe(2020);
});
