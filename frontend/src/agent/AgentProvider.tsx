import { useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  useAssistantInstructions,
  useAssistantTool,
} from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
import * as api from "../api";
import { parseSearch } from "../app/navigation";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { useStore } from "../store";
import { buildInstructions } from "./context";
import { createHistoryAdapter, type StoredThread } from "./history";
import {
  createToolExecutors,
  toolDefinitions,
  type ToolExecutor,
  type ToolName,
} from "./tools";

/**
 * 에이전트 서버 주소. 브라우저는 Vite 가 `/api/agent` 를 프록시하지만,
 * 설치된 앱의 웹뷰(`tauri://localhost`)에는 프록시가 없어 서버를 직접 부른다.
 * 서버는 그 출처를 CORS 로 허용한다. 서버가 꺼져 있으면 첫 메시지가
 * 오류로 표시된다 — `npm --prefix agent start`.
 */
export const AGENT_API = api.desktop
  ? "http://127.0.0.1:8787/api/agent"
  : "/api/agent";

/** 서버가 도구 결과를 기다리는 자리. 실행은 여기서 끝났고 결과만 돌려준다. */
async function postToolResult(
  sessionId: string,
  toolCallId: string,
  result: unknown,
  isError = false,
) {
  try {
    await fetch(`${AGENT_API}/tool-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, toolCallId, result, isError }),
    });
  } catch (error) {
    // 서버가 결과를 못 받으면 60초 뒤 오류 결과로 넘어간다. 화면의 카드는 이미
    // 결과를 들고 있으므로 여기서는 기록만 남긴다.
    console.warn("[agent] tool-result 전송 실패", error);
  }
}

/** 도구 하나를 런타임에 등록한다. 훅 호출 수를 고정하려고 도구마다 컴포넌트다. */
function RegisteredTool({
  name,
  execute,
  sessionId,
}: {
  name: ToolName;
  execute: ToolExecutor;
  sessionId: string;
}) {
  const def = toolDefinitions[name];
  useAssistantTool({
    toolName: name,
    type: "frontend",
    description: def.description,
    parameters: def.parameters,
    execute: async (args, { toolCallId }) => {
      let result: unknown, isError = false;
      try {
        result = await execute(args as Record<string, unknown>);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
        isError = true;
      }
      await postToolResult(sessionId, toolCallId, result, isError);
      return result;
    },
  });
  return null;
}

/** 도구를 등록하고 현재 맥락을 시스템 프롬프트로 올린다. 화면은 없다. */
function AgentTools({ run, sessionId }: { run: string; sessionId: string }) {
  const a = useAnalysis();
  const { state, update } = useExploration();
  const queryClient = useQueryClient();
  const requestCamera = useStore((s) => s.requestCamera);
  const setAnnotations = useStore((s) => s.setAnnotations);
  const annotations = useStore((s) => s.annotations);
  const level = useStore((s) => s.mapLevel);
  // 도구는 실행 시점의 URL 상태를 읽어야 한다. 라우터에서 그때그때 읽는다.
  const router = useRouter();
  const readState = useCallback(
    () => parseSearch(router.state.location.search as Record<string, unknown>),
    [router],
  );

  const executors = useMemo(
    () =>
      createToolExecutors({
        run,
        map: () =>
          queryClient.fetchQuery({
            queryKey: ["map", run],
            queryFn: ({ signal }) => api.fetchMap(run, signal),
          }),
        clusters: () =>
          queryClient.fetchQuery({
            queryKey: ["clusters", run],
            queryFn: ({ signal }) => api.fetchClusters(run, signal),
          }),
        state: readState,
        update,
        requestCamera,
        annotations: () => useStore.getState().annotations,
        setAnnotations,
        api,
      }),
    [run, queryClient, update, requestCamera, setAnnotations, readState],
  );

  const map = a.map.data;
  const clusters = a.clusters.data ?? [];
  const selectedIndex = state.selected
    ? (map?.id.indexOf(state.selected) ?? -1)
    : -1;
  const cluster =
    state.cluster !== undefined
      ? clusters.find((c) => c.cluster_id === state.cluster)
      : undefined;
  const node =
    state.node !== undefined
      ? a.tree.data?.nodes.find((n) => n.id === state.node)
      : undefined;
  useAssistantInstructions(
    buildInstructions({
      runId: run,
      model: a.runs.data?.find((r) => r.run_id === run)?.model ?? null,
      paperCount: map?.n ?? 0,
      topicCount: clusters.length,
      view: state.view,
      level,
      query: state.q,
      yearFrom: state.from,
      yearTo: state.to,
      selectedPaper:
        map && selectedIndex >= 0
          ? {
              id: map.id[selectedIndex]!,
              title: map.title[selectedIndex]!,
              year: map.year[selectedIndex] ?? null,
            }
          : undefined,
      selectedCluster: cluster
        ? { id: cluster.cluster_id, label: cluster.label }
        : undefined,
      selectedNode: node ? { id: node.id, label: node.label } : undefined,
      annotationCount: annotations.length,
    }),
  );
  return (Object.keys(toolDefinitions) as ToolName[]).map((name) => (
    <RegisteredTool
      key={name}
      name={name}
      execute={executors[name]}
      sessionId={sessionId}
    />
  ));
}

/**
 * 채팅 런타임. Claude Agent SDK 서버(`/api/agent`)에 붙고 세션 UUID 를 매
 * 요청에 실어 보낸다. 서버는 그 id 로 세션을 열거나 이어간다. run 이나
 * 대화가 바뀌면 부모가 key 로 다시 마운트한다.
 */
export function AgentProvider({
  run,
  thread,
  children,
}: {
  run: string;
  thread: StoredThread;
  children: ReactNode;
}) {
  const runtime = useDataStreamRuntime(
    useMemo(
      () => ({
        api: AGENT_API,
        body: () => ({ sessionId: thread.sessionId }),
        adapters: { history: createHistoryAdapter(run, thread) },
        onError: (error: Error) => console.error("[agent]", error),
      }),
      [run, thread],
    ),
  );
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AgentTools run={run} sessionId={thread.sessionId} />
      {children}
    </AssistantRuntimeProvider>
  );
}
