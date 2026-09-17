import type {
  ExportedMessageRepository,
  ExportedMessageRepositoryItem,
  ThreadHistoryAdapter,
  ThreadMessage,
} from "@assistant-ui/react";

/**
 * 대화 저장. run(분석)마다 대화 하나를 localStorage에 둔다.
 *
 * 서버는 같은 sessionId로 Agent SDK 세션을 이어가고, 화면은 여기 저장한
 * 메시지로 이전 턴을 다시 그린다. 둘은 같은 UUID로 묶인다.
 */
export interface StoredThread {
  version: 1;
  sessionId: string;
  repository: ExportedMessageRepository;
}

export const threadKey = (run: string) => `constellation.agent.v1:${run}`;

export function newThread(): StoredThread {
  return {
    version: 1,
    sessionId: crypto.randomUUID(),
    repository: { headId: null, messages: [] },
  };
}

export function readThread(run: string): StoredThread | null {
  try {
    const raw = JSON.parse(localStorage.getItem(threadKey(run)) ?? "null");
    if (!raw || raw.version !== 1 || typeof raw.sessionId !== "string")
      return null;
    const messages = Array.isArray(raw.repository?.messages)
      ? raw.repository.messages
      : [];
    return {
      version: 1,
      sessionId: raw.sessionId,
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
    localStorage.setItem(threadKey(run), JSON.stringify(thread));
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

/**
 * assistant-ui 로컬 런타임의 히스토리 어댑터. `load`는 마운트 때 한 번,
 * `append`/`update`는 메시지가 생기고 바뀔 때마다 온다.
 */
export function createHistoryAdapter(
  run: string,
  thread: StoredThread,
): ThreadHistoryAdapter {
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
  };
}
