import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AGENT_API } from "./AgentProvider";

/**
 * 에이전트 서버가 떠 있는지. 마운트 때 `GET /api/agent/health` 를 부르고,
 * 요청이 네트워크 오류(`TypeError` — WebKit 의 "Load failed", Chromium 의
 * "Failed to fetch")로 끝나면 같은 상태로 모은다. 화면은 이 값으로 채팅 대신
 * "서버가 꺼져 있습니다" 안내를 그린다.
 *
 * 상태는 모듈 하나에 둔다 — 사이드바가 다시 마운트돼도(새 대화, run 전환)
 * 건강 검사를 반복하지 않고, 어디서 난 오류든 같은 자리에 모인다.
 */
export type AgentHealth = "unknown" | "online" | "offline";

let health: AgentHealth = "unknown";
const listeners = new Set<() => void>();

function set(next: AgentHealth) {
  if (health === next) return;
  health = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * fetch 가 서버에 닿지 못했을 때(`TypeError`), 또는 Vite 프록시가 서버 대신
 * 502·503·504 를 돌려줬을 때 offline 으로 본다. 그 밖의 4xx·5xx 는 서버가
 * 살아 있다.
 */
export function reportAgentError(error: unknown) {
  if (error instanceof TypeError) set("offline");
  else if (error instanceof Error && /^Status 50[234]\b/.test(error.message))
    set("offline");
}

export async function checkAgentHealth(): Promise<AgentHealth> {
  try {
    const res = await fetch(`${AGENT_API}/health`, { cache: "no-store" });
    set(res.ok ? "online" : "offline");
  } catch {
    set("offline");
  }
  return health;
}

export function useAgentHealth() {
  const state = useSyncExternalStore(subscribe, () => health, () => "unknown" as const);
  useEffect(() => {
    if (health === "unknown") void checkAgentHealth();
  }, []);
  const retry = useCallback(() => checkAgentHealth(), []);
  return { health: state, retry };
}
