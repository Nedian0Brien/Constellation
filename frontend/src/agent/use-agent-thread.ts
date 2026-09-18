import { useCallback, useState } from "react";
import { newThread, readThread, writeThread } from "./history";

/**
 * run 하나에 대화 하나. localStorage 에서 읽고, "새 대화"는 새 UUID 로
 * 덮어쓴다. `key` 는 Provider 를 다시 마운트하는 열쇠다.
 */
export function useAgentThread(run: string | undefined) {
  const load = (r: string | undefined) =>
    r ? (readThread(r) ?? newThread()) : newThread();
  const [state, setState] = useState(() => ({
    run,
    thread: load(run),
    generation: 0,
  }));
  // run 이 바뀌면 그 run 의 대화로 갈아탄다. 렌더 중 상태를 맞추는 React 권장 패턴.
  if (state.run !== run) {
    setState({ run, thread: load(run), generation: state.generation + 1 });
  }
  const reset = useCallback(() => {
    setState((s) => {
      const thread = newThread();
      if (s.run) writeThread(s.run, thread);
      return { ...s, thread, generation: s.generation + 1 };
    });
  }, []);
  return {
    thread: state.thread,
    key: `${run ?? "-"}:${state.generation}`,
    reset,
  };
}
