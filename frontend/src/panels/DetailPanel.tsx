import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { DataState } from "../components/DataState";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "../components/ui/item";
import { fetchWork } from "../api";
import { useWorkspace } from "../hooks/use-workspace";

// 인스펙터 본문. 래퍼·헤더·닫기 버튼은 Inspector가 그린다.
export default function DetailPanel() {
  const workspace = useWorkspace();
  const selected = workspace.selected;
  const result = useQuery({
    queryKey: ["work", workspace.map?.run_id, selected],
    queryFn: ({ signal }) =>
      fetchWork(selected!, workspace.map?.run_id, signal),
    enabled: !!selected,
  });
  const work = result.data;
  if (!work)
    return (
      <DataState
        error={result.error}
        loading={result.isPending}
        retry={() => result.refetch()}
      />
    );
  const doi = work.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg leading-snug font-semibold tracking-tight">
        {work.title}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {work.year && <Badge variant="secondary">{work.year}</Badge>}
        {work.type && <Badge variant="secondary">{work.type}</Badge>}
        <Badge variant="secondary">
          피인용 {(work.cited_by_count ?? 0).toLocaleString()}
        </Badge>
      </div>
      {work.venue && (
        <p className="text-sm text-muted-foreground">{work.venue}</p>
      )}
      {work.authors.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {work.authors.slice(0, 8).join(", ")}
          {work.authors.length > 8 && ` 외 ${work.authors.length - 8}명`}
        </p>
      )}
      <ItemGroup className="grid grid-cols-2 gap-2">
        <Item variant="outline" size="sm">
          <ItemContent>
            <ItemDescription>코퍼스 내 참고문헌</ItemDescription>
            <ItemTitle className="tabular-nums">{work.refs_in_corpus}</ItemTitle>
          </ItemContent>
        </Item>
        <Item variant="outline" size="sm">
          <ItemContent>
            <ItemDescription>코퍼스 내 피인용</ItemDescription>
            <ItemTitle className="tabular-nums">
              {work.cited_by_in_corpus}
            </ItemTitle>
          </ItemContent>
        </Item>
      </ItemGroup>
      <Separator />
      {work.abstract ? (
        <p className="text-sm leading-relaxed">{work.abstract}</p>
      ) : (
        <Alert>
          <AlertTitle>초록 없음</AlertTitle>
          <AlertDescription>
            제목만으로 임베딩된 논문이다. 위치의 신뢰도가 낮다.
          </AlertDescription>
        </Alert>
      )}
      {work.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {work.topics.map((t) => (
            <Badge key={t.kind + t.name} variant="outline">
              {t.name}
            </Badge>
          ))}
        </div>
      )}
      {doi && (
        <Button
          variant="link"
          className="w-fit px-0"
          nativeButton={false}
          render={
            <a
              href={`https://doi.org/${doi}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          원문 보기
          <ExternalLink data-icon="inline-end" />
        </Button>
      )}
    </div>
  );
}
