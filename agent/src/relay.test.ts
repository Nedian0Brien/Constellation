import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  Relay,
  UnsupportedSchemaError,
  canonicalArgs,
  schemaToShape,
  schemaToZod,
} from "./relay.ts";

test("schemaToShape: 문자열·정수·enum·배열·중첩 객체와 required 를 옮긴다", () => {
  const shape = schemaToShape({
    type: "object",
    properties: {
      query: { type: "string", description: "검색어" },
      year_from: { type: "integer" },
      sort: { type: "string", enum: ["cited", "year"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, x: { type: "number" } },
          required: ["label"],
        },
      },
    },
    required: ["query"],
  });
  const schema = z.object(shape);
  assert.deepEqual(
    schema.parse({ query: "rag", items: [{ label: "a", x: 1.5 }] }),
    { query: "rag", items: [{ label: "a", x: 1.5 }] },
  );
  assert.throws(() => schema.parse({}));
  assert.throws(() => schema.parse({ query: "x", year_from: 1.5 }));
  assert.throws(() => schema.parse({ query: "x", sort: "title" }));
  assert.equal(shape.query!.description, "검색어");
});

test("schemaToZod: 부분집합 밖은 UnsupportedSchemaError", () => {
  assert.throws(
    () => schemaToZod({ type: "object", properties: { a: { type: "array" } } }),
    UnsupportedSchemaError,
  );
  assert.throws(
    () => schemaToZod({ type: "object", properties: { a: { enum: [1, 2] } } }),
    UnsupportedSchemaError,
  );
  assert.throws(() => schemaToZod({ type: "function" }), UnsupportedSchemaError);
});

test("canonicalArgs: 키 순서와 undefined 를 무시한다", () => {
  assert.equal(
    canonicalArgs({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } }),
    canonicalArgs({ a: { c: [3, { y: 2, z: 1 }] }, b: 1 }),
  );
});

test("Relay: 관찰 → 결과 → 핸들러 순서든 핸들러 → 관찰 → 결과 순서든 짝이 맞는다", async () => {
  const relay = new Relay();
  relay.observeCall({ toolUseId: "t1", toolName: "fly_to", argsText: '{"paper_id":"p1"}' });
  relay.resolve("t1", { result: "ok" });
  assert.deepEqual(await relay.waitFor("fly_to", { paper_id: "p1" }), { result: "ok" });

  const pending = relay.waitFor("zoom", { steps: 2 });
  relay.observeCall({ toolUseId: "t2", toolName: "zoom", argsText: '{"steps":2}' });
  relay.resolve("t2", { result: { zoom: 3 } });
  assert.deepEqual(await pending, { result: { zoom: 3 } });
});

test("Relay: 같은 이름의 호출이 둘이면 인자로 가르고, 인자를 못 읽으면 순서로 간다", async () => {
  const relay = new Relay();
  relay.observeCall({ toolUseId: "a", toolName: "search_papers", argsText: '{"query":"rag"}' });
  relay.observeCall({ toolUseId: "b", toolName: "search_papers", argsText: '{"query":"ir"}' });
  const second = relay.waitFor("search_papers", { query: "ir" });
  const first = relay.waitFor("search_papers", { query: "rag" });
  relay.resolve("a", { result: "A" });
  relay.resolve("b", { result: "B" });
  assert.deepEqual(await first, { result: "A" });
  assert.deepEqual(await second, { result: "B" });

  relay.observeCall({ toolUseId: "c", toolName: "get_paper", argsText: "{not json" });
  relay.resolve("c", { result: "C" });
  assert.deepEqual(await relay.waitFor("get_paper", { id: "x" }), { result: "C" });
});

test("Relay: 결과가 늦으면 오류 결과를 돌려주고 abort 는 대기 중인 핸들러를 깨운다", async () => {
  const relay = new Relay({ resultTimeoutMs: 20, matchTimeoutMs: 20 });
  relay.observeCall({ toolUseId: "slow", toolName: "annotate", argsText: "{}" });
  const late = await relay.waitFor("annotate", {});
  assert.equal(late.isError, true);

  await assert.rejects(relay.waitFor("never", {}), /찾지 못했습니다/);

  const relay2 = new Relay();
  relay2.observeCall({ toolUseId: "x", toolName: "select", argsText: "{}" });
  const waiting = relay2.waitFor("select", {});
  relay2.abort();
  assert.equal((await waiting).isError, true);
  await assert.rejects(relay2.waitFor("select", {}), /중단/);
});
