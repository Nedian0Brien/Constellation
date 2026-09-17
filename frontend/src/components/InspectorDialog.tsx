import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useExploration } from "../hooks/use-exploration";
import DetailPanel from "../panels/DetailPanel";
import ClusterPanel from "../panels/ClusterPanel";

// 논문·주제 상세. 우측 사이드바가 에이전트 채팅이 되면서 선택 시 열리는
// Dialog로 옮겼다. 열림은 URL의 선택 상태가 정하고, 닫으면(✕·Escape·바깥
// 클릭) 선택을 지운다. 논문이 주제·분야보다 우선한다.
export function InspectorDialog() {
  const { state, update } = useExploration();
  const kind = state.selected
    ? "paper"
    : state.cluster !== undefined
      ? "cluster"
      : state.node !== undefined
        ? "node"
        : null;
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open)
          update({ selected: undefined, cluster: undefined, node: undefined });
      }}
    >
      {/* 폭 512px: design-ops patterns/modal.md 기본값. 본문이 길면 안에서 스크롤한다. */}
      <DialogContent
        data-testid="inspector"
        className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <span className="eyebrow">
            {kind === "paper"
              ? "논문"
              : kind === "cluster"
                ? "연구 주제"
                : "연구 분야"}
          </span>
          {/* 패널이 제목 h2를 그리므로 Dialog 제목은 보조기기용으로만 둔다. */}
          <DialogTitle render={<p />} className="sr-only">
            {kind === "paper" ? "논문 상세" : "연구 주제 상세"}
          </DialogTitle>
        </DialogHeader>
        {kind === "paper" ? <DetailPanel /> : kind !== null && <ClusterPanel />}
      </DialogContent>
    </Dialog>
  );
}
