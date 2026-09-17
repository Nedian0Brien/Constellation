import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "../components/ui/item";

export interface WorkRow {
  id: string;
  title: string;
  year: number | null;
  cited: number;
}

// 피인용 상위 논문 목록. 주제 상세(ClusterPanel)와 갈래 상세(FlowView)가 같이 쓴다.
// 행은 선택 동작이라 button으로 그린다. Item의 hover는 링크에만 붙어 있어
// 버튼에도 같은 피드백을 준다.
export function WorkList({
  works,
  onSelect,
}: {
  works: WorkRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <ItemGroup>
      {works.map((w) => (
        <Item
          key={w.id}
          size="sm"
          className="cursor-pointer text-left hover:bg-muted"
          render={<button type="button" onClick={() => onSelect(w.id)} />}
        >
          <ItemContent>
            <ItemTitle className="line-clamp-2">{w.title}</ItemTitle>
            <ItemDescription className="tabular-nums">
              {w.year ?? "—"} · 피인용 {w.cited.toLocaleString()}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
