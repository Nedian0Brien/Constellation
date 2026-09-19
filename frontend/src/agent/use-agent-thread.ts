import { useCallback, useState } from "react";
import { newThread, readThread, writeThread, type Provider } from "./history";

/**
 * run·프로바이더 하나에 대화 하나. localStorage 에서 읽고, "새 대화"는 새 UUID 로
 * 덮어쓴다. `key` 는 Provider 를 다시 마운트하는 열쇠다. 프로바이더가 바뀌면
 * 그 프로바이더의 대화로 갈아탄다.
 */
export function useAgentThread(run: string | undefined, provider: Provider) {
  const load = (r: string | undefined, p: Provider) =>
    r ? (readThread(r, p) ?? newThread(p)) : newThread(p);
  const [state, setState] = useState(() => ({
    run,
    provider,
    thread: load(run, provider),
    generation: 0,
  }));
  // run·프로바이더가 바뀌면 그 대화로 갈아탄다. 렌더 중 상태를 맞추는 React 권장 패턴.
  if (state.run !== run || state.provider !== provider) {
    setState({
      run,
      provider,
      thread: load(run, provider),
      generation: state.generation + 1,
    });
  }
  const reset = useCallback(() => {
    setState((s) => {
      const thread = newThread(s.provider);
      if (s.run) writeThread(s.run, thread);
      return { ...s, thread, generation: s.generation + 1 };
    });
  }, []);
  return {
    thread: state.thread,
    key: `${run ?? "-"}:${provider}:${state.generation}`,
    reset,
  };
}
