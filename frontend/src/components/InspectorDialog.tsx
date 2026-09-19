import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { useStore } from "../store";
import DetailPanel from "../panels/DetailPanel";
import ClusterPanel from "../panels/ClusterPanel";

// 논문·주제 상세. 우측 사이드바가 에이전트 채팅이 되면서 선택 시 열리는
// Dialog로 옮겼다. 지도의 선택 모드가 기본이라 논문·주제·분야 모두 버튼 셋의
// "상세정보"(`detailOpen`)로만 열고, 닫아도(✕·Escape·바깥 클릭) 선택은 남는다.
// 논문이 주제·분야보다 우선한다.
export function InspectorDialog() {
  const { state } = useExploration();
  const a = useAnalysis();
  const detailOpen = useStore((s) => s.detailOpen),
    setDetailOpen = useStore((s) => s.setDetailOpen);
  const kind = state.selected
    ? "paper"
    : state.cluster !== undefined
      ? "cluster"
      : state.node !== undefined
        ? "node"
        : null;
  // 주제·분야는 분석 결과에 있는 것만 연다. 없는 id 는 스테이지의 안내
  // (`.invalid-region`)가 맡고, 결과를 받기 전에는 열었다 닫지 않는다.
  const open =
    detailOpen &&
    ((kind === "paper" && !!a.map.data?.id.includes(state.selected!)) ||
      (kind === "cluster" &&
        !!a.clusters.data?.some((c) => c.cluster_id === state.cluster)) ||
      (kind === "node" &&
        !!a.tree.data?.nodes.some((n) => n.id === state.node)));
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) setDetailOpen(false);
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
