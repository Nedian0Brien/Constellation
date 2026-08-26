import { useEffect, useState } from "react";
import { fetchWork, type Work } from "../api";
import { useStore } from "../store";

export default function DetailPanel() {
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const [work, setWork] = useState<Work | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setWork(null);
      return;
    }
    let alive = true;
    setErr(null);
    setWork(null);
    fetchWork(selected)
      .then((w) => alive && setWork(w))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [selected]);

  if (!selected) {
    return (
      <aside className="detail detail--empty">
        <p>점을 클릭하면 논문이 여기 나타난다.</p>
      </aside>
    );
  }

  return (
    <aside className="detail">
      <button className="close" onClick={() => select(null)} aria-label="닫기">
        ✕
      </button>

      {err && <p className="err">불러오지 못했다: {err}</p>}
      {!work && !err && <p className="dim">불러오는 중…</p>}

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
            <span>코퍼스 내 참고문헌 <b>{work.refs_in_corpus}</b></span>
            <span>코퍼스 내 피인용 <b>{work.cited_by_in_corpus}</b></span>
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
                <span key={t.kind + t.name} className={`topic topic--${t.kind}`}>
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
