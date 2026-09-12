import { useQuery } from "@tanstack/react-query";
import { DataState } from "../components/DataState";
import { fetchWork } from "../api";
import { useWorkspace } from "../hooks/use-workspace";

export default function DetailPanel() {
  const workspace = useWorkspace();
  const selected = workspace.selected;
  const select = workspace.select;
  const result = useQuery({
    queryKey: ["work", workspace.map?.run_id, selected],
    queryFn: ({ signal }) =>
      fetchWork(selected!, workspace.map?.run_id, signal),
    enabled: !!selected,
  });
  const work = result.data;
  // 비어 있을 때는 아예 그리지 않는다. 380px짜리 빈 패널이 떠 있으면
  // 지도가 그만큼 왼쪽으로 밀려 화면 중앙에서 벗어난다.
  if (!selected) return null;

  return (
    <aside className="detail">
      <button className="close" onClick={() => select(null)} aria-label="닫기">
        ✕
      </button>

      {!work && (
        <DataState
          error={result.error}
          loading={result.isPending}
          retry={() => result.refetch()}
        />
      )}

      {work && (
        <>
          <h2>{work.title}</h2>

          <div className="meta-row">
            {work.year && <span className="tag">{work.year}</span>}
            {work.type && <span className="tag">{work.type}</span>}
            <span className="tag">
              피인용 {(work.cited_by_count ?? 0).toLocaleString()}
            </span>
          </div>

          {work.venue && <p className="venue">{work.venue}</p>}

          {work.authors.length > 0 && (
            <p className="authors">
              {work.authors.slice(0, 8).join(", ")}
              {work.authors.length > 8 && ` 외 ${work.authors.length - 8}명`}
            </p>
          )}

          <div className="corpus-links">
            <span>
              코퍼스 내 참고문헌 <b>{work.refs_in_corpus}</b>
            </span>
            <span>
              코퍼스 내 피인용 <b>{work.cited_by_in_corpus}</b>
            </span>
          </div>

          {work.abstract ? (
            <p className="abstract">{work.abstract}</p>
          ) : (
            <p className="no-abstract">
              초록 없음 — 제목만으로 임베딩된 논문이다. 위치의 신뢰도가 낮다.
            </p>
          )}

          {work.topics.length > 0 && (
            <div className="topics">
              {work.topics.map((t) => (
                <span
                  key={t.kind + t.name}
                  className={`topic topic--${t.kind}`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {work.doi && (
            <a
              className="doi"
              href={`https://doi.org/${work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              원문 보기 ↗
            </a>
          )}
        </>
      )}
    </aside>
  );
}
