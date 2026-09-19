import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ModelSelector,
  resolveModelEffort,
  resolveModelSpeed,
} from "../components/assistant-ui/elements/model-selector.aui";
import type { ModelOption } from "../components/assistant-ui/elements/model-selector";
import { ClaudeLogo, OpenAILogo } from "../components/assistant-ui/elements/logos";
import { AGENT_API } from "./AgentProvider";
import { useModelSelection, writeModelSelection } from "./settings";

/**
 * 작성창의 모델 선택기. 프로바이더 그룹(로고) → 모델 → effort → speed.
 * 목록은 `GET /api/agent/models`, 선택은 `settings.ts`(localStorage).
 *
 * NOTE(constellation): agent-chat-framework 의 `src/app/chat/chat-model-selector.tsx`
 * + `use-model-catalog.ts` 를 옮긴 것이다. 카탈로그는 모듈 변수에 한 번만
 * 받는다 — 사이드바가 다시 마운트될 때(새 대화, 프로바이더 전환)마다 서버가
 * `claude` 프로세스를 띄우지 않게.
 *
 * 트리거 높이 32px(`size="sm"`)는 코퍼스 `patterns/button.md` Implementation
 * defaults 의 "desktop dense 32"(Codex·Pajamas·Semi·Vapor 기본, Ant·Orbit·Radix
 * size 2; 77개 표본)를 따른다.
 */
type CatalogModel = {
  id: string;
  name: string;
  description: string;
  efforts: { id: string; name: string }[];
  speeds: { id: string; name: string; description?: string }[];
  isDefault: boolean;
};
type Catalog = {
  providers: { id: string; name: string; models: CatalogModel[]; error?: string }[];
};

const PROVIDER_ICONS: Record<string, ReactNode> = {
  claude: <ClaudeLogo />,
  codex: <OpenAILogo />,
};

let catalogPromise: Promise<Catalog> | undefined;
function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch(`${AGENT_API}/models`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return (await res.json()) as Catalog;
    })
    .catch((error: unknown) => {
      // 실패는 캐시하지 않는다. 서버가 뜨면 다음 마운트에서 다시 받는다.
      catalogPromise = undefined;
      throw error;
    });
  return catalogPromise;
}

function useModelCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (c) => live && setCatalog(c),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => {
    const groups = (catalog?.providers ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      error: p.error,
      models: p.models.map(
        (m): ModelOption => ({
          id: m.id,
          name: m.name,
          description: m.description,
          icon: PROVIDER_ICONS[p.id],
          keywords: [p.name],
          ...(m.efforts.length ? { efforts: m.efforts } : {}),
          ...(m.speeds.length ? { speeds: m.speeds } : {}),
        }),
      ),
    }));
    const models = groups.flatMap((g) => g.models);
    let defaultModel: string | undefined;
    for (const p of catalog?.providers ?? []) {
      const d = p.models.find((m) => m.isDefault) ?? p.models[0];
      if (d) {
        defaultModel = d.id;
        break;
      }
    }
    return { groups, models, defaultModel, loaded: catalog !== null };
  }, [catalog]);
}

export function AgentModelSelector() {
  const selection = useModelSelection();
  const { groups, models, defaultModel, loaded } = useModelCatalog();

  // 저장된 모델이 카탈로그에 없으면(모델 퇴역 등) 기본 모델로 돌아간다.
  const value =
    selection.modelName && models.some((m) => m.id === selection.modelName)
      ? selection.modelName
      : defaultModel;

  if (!loaded || models.length === 0) return null;

  return (
    <ModelSelector.Root
      models={models}
      value={value}
      // 모델을 바꾸면 그 모델이 받는 effort·speed 만 남긴다. 저장값을 그대로 두면
      // body() 가 다른 프로바이더의 티어(codex `priority`)를 Claude 에 보낸다.
      onValueChange={(modelName) =>
        writeModelSelection({
          modelName,
          effort: resolveModelEffort(models, modelName, selection.effort),
          speed: resolveModelSpeed(models, modelName, selection.speed),
        })
      }
      effort={selection.effort}
      onEffortChange={(effort) => writeModelSelection({ ...selection, effort })}
      speed={selection.speed ?? ""}
      onSpeedChange={(speed) =>
        writeModelSelection({ ...selection, speed: speed || undefined })
      }
    >
      <ModelSelector.ModelContext />
      <ModelSelector.Trigger
        variant="ghost"
        size="sm"
        className="max-w-52"
        aria-label="모델 선택"
      >
        <ModelSelector.Value placeholder="모델" />
      </ModelSelector.Trigger>
      <ModelSelector.Content side="top">
        <ModelSelector.List>
          <ModelSelector.Empty>모델 없음</ModelSelector.Empty>
          {groups.map((group, i) => (
            <div key={group.id}>
              {i > 0 && <ModelSelector.Separator />}
              <ModelSelector.Group
                heading={
                  <span className="flex items-center gap-1.5">
                    <span className="flex size-3.5 items-center justify-center [&_svg]:size-3.5">
                      {PROVIDER_ICONS[group.id]}
                    </span>
                    {group.name}
                    {group.error && (
                      <span
                        className="text-destructive truncate font-normal"
                        title={group.error}
                      >
                        — 사용 불가
                      </span>
                    )}
                  </span>
                }
              >
                {group.models.map((m) => (
                  <ModelSelector.Item key={m.id} model={m} />
                ))}
              </ModelSelector.Group>
            </div>
          ))}
        </ModelSelector.List>
        <ModelSelector.Effort label="추론" />
        <ModelSelector.Speed label="속도" />
      </ModelSelector.Content>
    </ModelSelector.Root>
  );
}
