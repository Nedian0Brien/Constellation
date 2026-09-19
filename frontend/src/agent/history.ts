import type {
  ExportedMessageRepository,
  ExportedMessageRepositoryItem,
  ThreadHistoryAdapter,
  ThreadMessage,
} from "@assistant-ui/react";

/**
 * 대화 저장. run(분석)·프로바이더마다 대화 하나를 localStorage에 둔다.
 *
 * `sessionId`는 클라이언트가 만든 UUID다. Claude는 이 값으로 Agent SDK 세션을
 * 이어가고, 서버의 도구 중계는 두 프로바이더 모두 이 값을 키로 쓴다. Codex의
 * 스레드 id는 app-server가 정하므로 첫 턴 응답(`data-session.codexThreadId`)을
 * 받아 `codexThreadId`에 따로 둔다. 화면은 여기 저장한 메시지로 이전 턴을
 * 다시 그린다.
 *
 * 프로바이더는 대화 단위로 고정된다. 선택기에서 프로바이더를 바꾸면 같은 run의
 * 그 프로바이더 대화로 갈아탄다 — 대화를 잃지 않는다.
 */
export type Provider = "claude" | "codex";

export interface StoredThread {
  version: 2;
  provider: Provider;
  sessionId: string;
  codexThreadId?: string;
  repository: ExportedMessageRepository;
}

export const threadKey = (run: string, provider: Provider) =>
  `constellation.agent.v2:${run}:${provider}`;
/** v1(프로바이더 이전)의 키. Claude 대화로 읽는다. */
const legacyKey = (run: string) => `constellation.agent.v1:${run}`;

export function newThread(provider: Provider): StoredThread {
  return {
    version: 2,
    provider,
    sessionId: crypto.randomUUID(),
    repository: { headId: null, messages: [] },
  };
}

export function readThread(run: string, provider: Provider): StoredThread | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(threadKey(run, provider)) ??
        (provider === "claude" ? localStorage.getItem(legacyKey(run)) : null) ??
        "null",
    );
    if (!raw || typeof raw.sessionId !== "string") return null;
    if (raw.version !== 2 && raw.version !== 1) return null;
    if (raw.version === 2 && raw.provider !== provider) return null;
    const messages = Array.isArray(raw.repository?.messages)
      ? raw.repository.messages
      : [];
    return {
      version: 2,
      provider,
      sessionId: raw.sessionId,
      ...(typeof raw.codexThreadId === "string"
        ? { codexThreadId: raw.codexThreadId }
        : {}),
      repository: {
        headId: raw.repository?.headId ?? null,
        messages: messages.map(reviveItem),
      },
    };
  } catch {
    return null;
  }
}

export function writeThread(run: string, thread: StoredThread) {
  try {
    localStorage.setItem(threadKey(run, thread.provider), JSON.stringify(thread));
  } catch {
    /* 저장이 막혀도 대화는 이어진다. 새로고침하면 사라질 뿐이다. */
  }
}

/** JSON을 거친 메시지를 런타임이 받는 모양으로. 날짜와 끊긴 상태를 되살린다. */
function reviveItem(item: ExportedMessageRepositoryItem): ExportedMessageRepositoryItem {
  const message = item.message as ThreadMessage & { createdAt: string | Date };
  const createdAt = new Date(message.createdAt);
  const status =
    message.role === "assistant" &&
    (message.status?.type === "running" ||
      message.status?.type === "requires-action")
      ? // 스트리밍 중에 새로고침한 메시지. 다시 돌지 않게 끊긴 것으로 둔다.
        ({ type: "incomplete", reason: "unknown" } as const)
      : message.status;
  return {
    parentId: item.parentId ?? null,
    message: {
      ...message,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      ...(message.role === "assistant" ? { status } : {}),
    } as ThreadMessage,
  };
}

/** 메시지 id로 덮어쓰는 upsert. append와 update 둘 다 여기로 온다. */
function upsert(
  repository: ExportedMessageRepository,
  item: ExportedMessageRepositoryItem,
): ExportedMessageRepository {
  const messages = repository.messages.filter(
    (m) => m.message.id !== item.message.id,
  );
  messages.push({ message: item.message, parentId: item.parentId ?? null });
  return { headId: item.message.id, messages };
}

export type HistoryAdapter = ThreadHistoryAdapter & {
  /** 메시지 밖의 필드(Codex 스레드 id)를 같은 저장본에 덧쓴다. */
  patch(fields: Partial<Pick<StoredThread, "codexThreadId">>): void;
  /** 지금 저장된 값. 요청 본문을 만들 때 읽는다. */
  current(): StoredThread;
};

/**
 * assistant-ui 로컬 런타임의 히스토리 어댑터. `load`는 마운트 때 한 번,
 * `append`/`update`는 메시지가 생기고 바뀔 때마다 온다. 저장본의 단일
 * 작성자라 `codexThreadId`도 여기로 쓴다.
 */
export function createHistoryAdapter(
  run: string,
  thread: StoredThread,
): HistoryAdapter {
  let current = thread;
  const persist = (item: ExportedMessageRepositoryItem) => {
    current = { ...current, repository: upsert(current.repository, item) };
    writeThread(run, current);
  };
  return {
    async load() {
      return current.repository;
    },
    async append(item) {
      persist(item);
    },
    async update(item) {
      persist(item);
    },
    patch(fields) {
      current = { ...current, ...fields };
      writeThread(run, current);
    },
    current() {
      return current;
    },
  };
}
