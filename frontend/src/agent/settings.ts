import { useSyncExternalStore } from "react";
import type { Provider } from "./history";

/**
 * 작성창 모델 선택의 저장. run·대화와 무관한 사용자 설정이라 localStorage
 * 하나에 두고 다음 턴부터 적용된다. `useSyncExternalStore`로 읽어 저장소가
 * 곧 상태다.
 *
 * NOTE(constellation): agent-chat-framework 의 `src/app/chat/model-selection.ts`
 * 를 옮긴 것이다. 키 이름과 `Provider` 타입 연결만 다르다.
 */
export type ModelSelection = {
  /** `claude/opus[1m]`, `codex/gpt-5.5` */
  modelName: string | undefined;
  effort: string | undefined;
  /** speed 티어 id. undefined 는 표준. */
  speed: string | undefined;
};

export const MODEL_SELECTION_KEY = "constellation.agent.model.v1";

export const EMPTY_SELECTION: ModelSelection = {
  modelName: undefined,
  effort: undefined,
  speed: undefined,
};

export function readModelSelection(): ModelSelection {
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_SELECTION_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return EMPTY_SELECTION;
    const pick = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return {
      modelName: pick(raw.modelName),
      effort: pick(raw.effort),
      speed: pick(raw.speed),
    };
  } catch {
    return EMPTY_SELECTION;
  }
}

export function writeModelSelection(selection: ModelSelection) {
  try {
    localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 상태로 산다. */
  }
  notify();
}

/** `claude/…` 의 `claude`. 접두사가 없거나 모르는 것이면 claude. */
export function providerOf(modelName: string | undefined): Provider {
  return modelName?.startsWith("codex/") ? "codex" : "claude";
}

const listeners = new Set<() => void>();
let snapshotRaw: string | null | undefined;
let snapshot: ModelSelection = EMPTY_SELECTION;

function notify() {
  for (const l of listeners) l();
}

export function subscribeModelSelection(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MODEL_SELECTION_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 같은 원문이면 같은 객체를 돌려준다 — useSyncExternalStore 가 요구한다. */
export function getModelSelectionSnapshot(): ModelSelection {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(MODEL_SELECTION_KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = readModelSelection();
  }
  return snapshot;
}

export function useModelSelection(): ModelSelection {
  return useSyncExternalStore(
    subscribeModelSelection,
    getModelSelectionSnapshot,
    () => EMPTY_SELECTION,
  );
}
