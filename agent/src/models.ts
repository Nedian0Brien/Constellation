import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getCodexAppServer } from "./codex/app-server.ts";
import type { ModelListResponse } from "./codex/protocol.ts";

// NOTE(constellation): agent-chat-framework 의 `src/lib/agent/models.ts` 를 옮긴
// 것이다. Claude 목록을 열 때 이 서버와 같은 cwd·격리 옵션을 쓴다.

/**
 * 프로바이더별 모델 카탈로그. `GET /api/agent/models` 가 이 모양 그대로 준다.
 *
 * 모델 id 는 `<provider>/<모델>` 이다. 채팅 런타임은 `modelName` 하나만
 * 보내므로 접두사가 백엔드를 고르는 유일한 기준이다.
 */
export type Provider = "claude" | "codex";

export type CatalogModel = {
  /** `claude/opus[1m]`, `codex/gpt-5.5` */
  id: string;
  name: string;
  description: string;
  /** 모델이 받는 effort. 비어 있으면 선택기가 세그먼트를 그리지 않는다. */
  efforts: { id: string; name: string }[];
  /** speed 티어. Claude 는 fast mode 하나, Codex 는 `serviceTiers`. */
  speeds: { id: string; name: string; description?: string }[];
  isDefault: boolean;
};

export type CatalogProvider = {
  id: Provider;
  name: string;
  models: CatalogModel[];
  /** 이 프로바이더를 쓸 수 없는 이유. 있으면 `models` 는 비어 있다. */
  error?: string;
};

export type Catalog = { providers: CatalogProvider[] };

export type ParsedModel = { provider: Provider; model: string | undefined };

/** `modelName` 을 프로바이더와 모델로 가른다. 접두사가 없으면 Claude 기본 모델이다. */
export function parseModelId(modelName: string | undefined): ParsedModel {
  if (!modelName) return { provider: "claude", model: undefined };
  const slash = modelName.indexOf("/");
  if (slash === -1) return { provider: "claude", model: modelName };
  const prefix = modelName.slice(0, slash);
  const rest = modelName.slice(slash + 1);
  if (prefix === "codex") return { provider: "codex", model: rest || undefined };
  if (prefix === "claude") return { provider: "claude", model: rest || undefined };
  return { provider: "claude", model: modelName };
}

const EFFORT_NAMES: Record<string, string> = {
  none: "None",
  minimal: "Min",
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
  ultra: "Ultra",
};

const effortOption = (id: string) => ({ id, name: EFFORT_NAMES[id] ?? id });

/**
 * Claude 모델. `supportedModels()` 는 `Query` 인스턴스 메서드라 프로세스를
 * 하나 띄워야 한다. 입력이 끝나지 않는 스트리밍 프롬프트로 세션을 열고
 * 목록만 받은 뒤 닫는다(이 기계에서 1.1초).
 */
async function listClaudeModels(): Promise<CatalogModel[]> {
  async function* never(): AsyncGenerator<never> {
    await new Promise(() => {});
  }
  const q = query({
    prompt: never() as AsyncIterable<never>,
    options: {
      cwd: path.resolve(import.meta.dirname, ".."),
      settingSources: [],
      strictMcpConfig: true,
      tools: [],
    },
  });
  try {
    const rows = await q.supportedModels();
    // `default` 는 다른 행의 별칭이다. 그 행을 기본값으로 표시하고 별칭은 뺀다.
    const defaultRow = rows.find((r) => r.value === "default");
    return rows
      .filter((r) => r.value !== "default")
      .map((r) => ({
        id: `claude/${r.value}`,
        name: r.displayName,
        description: r.description,
        efforts: (r.supportedEffortLevels ?? []).map(effortOption),
        speeds: r.supportsFastMode
          ? [{ id: "fast", name: "Fast", description: "Fast mode" }]
          : [],
        isDefault:
          defaultRow?.resolvedModel !== undefined &&
          r.resolvedModel === defaultRow.resolvedModel,
      }));
  } finally {
    q.close();
  }
}

async function listCodexModels(): Promise<CatalogModel[]> {
  const server = getCodexAppServer();
  const res = await server.request<ModelListResponse>("model/list", {});
  return res.data
    .filter((m) => !m.hidden)
    .map((m) => ({
      id: `codex/${m.model}`,
      name: m.displayName,
      description: m.description,
      efforts: m.supportedReasoningEfforts.map((e) => effortOption(e.reasoningEffort)),
      speeds: m.serviceTiers.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
      })),
      isDefault: m.isDefault,
    }));
}

const cache = new Map<Provider, Promise<CatalogModel[]>>();

async function cached(provider: Provider, load: () => Promise<CatalogModel[]>) {
  let p = cache.get(provider);
  if (!p) {
    p = load().catch((error) => {
      // 실패는 캐시하지 않는다. CLI 를 나중에 설치하면 다음 호출에서 잡힌다.
      cache.delete(provider);
      throw error;
    });
    cache.set(provider, p);
  }
  return p;
}

export async function listModels(): Promise<Catalog> {
  const [claude, codex] = await Promise.allSettled([
    cached("claude", listClaudeModels),
    cached("codex", listCodexModels),
  ]);
  const toProvider = (
    id: Provider,
    name: string,
    result: PromiseSettledResult<CatalogModel[]>,
  ): CatalogProvider =>
    result.status === "fulfilled"
      ? { id, name, models: result.value }
      : {
          id,
          name,
          models: [],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
  return {
    providers: [
      toProvider("claude", "Claude", claude),
      toProvider("codex", "Codex", codex),
    ],
  };
}
