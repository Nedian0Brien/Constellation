"""Constellation CLI.

웹 UI 없이 파이프라인 전체를 돌릴 수 있어야 한다 — 디버깅과 재현성 양쪽에 필요하다.
"""
from __future__ import annotations

import asyncio
import sys

import typer
from rich.console import Console
from rich.table import Table

from . import queries
from .config import DB_PATH, Settings
from .db import store
from .ingest import collect as collect_mod

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

app = typer.Typer(add_completion=False, help="Constellation — 연구 지형 지도")
console = Console()


CORPUS = typer.Option(None, "--corpus", "-c",
                      help="대상 코퍼스 id. 코퍼스가 하나면 생략 가능")
MAP = typer.Option(None, "--map",
                   help="대상 지도(project run id). 생략하면 코퍼스·모델의 최신 지도")


def _scoped(fn):
    """대상 코퍼스·지도를 확정하지 못하면 목록을 보여 주고 종료 코드 1로 끝낸다."""
    from .db.scope import ScopeError
    try:
        return fn()
    except ScopeError as e:
        console.print("[red]%s[/]" % e)
        raise typer.Exit(1)


def _corpus(corpus: str | None) -> str:
    from .db.scope import resolve_corpus
    conn = store.connect(read_only=True)
    try:
        return _scoped(lambda: resolve_corpus(conn, corpus))
    finally:
        conn.close()


def _settings() -> Settings:
    s = Settings.load()
    if not s.openalex_api_key:
        console.print("[red]OPENALEX_API_KEY가 없다.[/] .env에 넣어라 "
                      "(.env.example 참고).")
        raise typer.Exit(1)
    return s


@app.command()
def collect(
    query_set: str = typer.Option("rag-ir", "--set", "-s", help="쿼리 세트 이름"),
    corpus: str | None = typer.Option(None, "--corpus", "-c",
                                      help="넣을 코퍼스 id. 생략하면 세트 이름"),
    limit: int = typer.Option(0, "--limit", "-n", help="총 상한 (0 = 세트 기본값)"),
) -> None:
    """OpenAlex에서 논문을 수집해 코퍼스에 넣는다. 코퍼스가 없으면 만든다."""
    qs = queries.get(query_set)
    s = _settings()
    result = asyncio.run(
        collect_mod.collect(qs, s, corpus=corpus, limit=limit or None,
                            log=console.print)
    )
    console.print()
    console.print("[green]수집 완료[/] — 고유 %s편, 신규 %s편  (run %s)"
                  % (format(result["total"], ","), format(result["new"], ","),
                     result["run_id"]))
    console.print("다음: [bold]constellation stats[/]")


@app.command()
def backfill(
    corpus: str | None = CORPUS,
    max_fetch: int = typer.Option(2000, "--max", help="끌어올 최대 편수"),
) -> None:
    """자주 인용되는 코퍼스 밖 논문을 끌어와 내부 인용 밀도를 올린다."""
    s = _settings()
    cid = _corpus(corpus)
    asyncio.run(collect_mod.backfill_citations(s, cid, max_fetch=max_fetch,
                                               log=console.print))


@app.command()
def enrich(corpus: str | None = CORPUS) -> None:
    """초록 결손분을 Semantic Scholar로 메운다 (실측 적중률 약 31%)."""
    asyncio.run(collect_mod.enrich_abstracts(_corpus(corpus), log=console.print))


@app.command()
def embed(
    model: str = typer.Option("scincl", "--model", "-m", help="임베딩 모델 키"),
    batch_size: int = typer.Option(64, "--batch", "-b"),
) -> None:
    """초록을 벡터로 만든다. 이미 계산한 논문은 캐시에서 재사용한다."""
    from .embed.run import embed_corpus
    r = embed_corpus(model, batch_size=batch_size, log=console.print)
    console.print("[green]완료[/] — %s편, 신규 %s개, %d차원"
                  % (format(r["n"], ","), format(r["new"], ","), r["dim"]))


@app.command()
def evaluate(
    models: str = typer.Option("", "--models", help="쉼표 구분. 비우면 캐시된 전부"),
    corpus: str | None = CORPUS,
) -> None:
    """인용 이웃 일치도로 임베딩 모델을 비교한다."""
    cid = _corpus(corpus)
    from .analyze import evaluate as ev
    from .embed.cache import EMB_DIR
    from .embed.encoder import MODELS

    keys = ([m.strip() for m in models.split(",") if m.strip()] or
            [k for k in MODELS if (EMB_DIR / k / "works.parquet").exists()])
    if not keys:
        console.print("[red]평가할 임베딩이 없다.[/] 먼저 constellation embed 를 돌려라.")
        raise typer.Exit(1)

    results = []
    for k in keys:
        try:
            results.append(ev.evaluate(k, cid, log=console.print))
        except Exception as e:
            console.print("[red]%s 실패:[/] %s" % (k, str(e)[:200]))
    if not results:
        raise typer.Exit(1)

    t = Table(title="인용 이웃 일치도 — 높을수록 임베딩이 지적 계보를 잘 반영한다",
              box=None, pad_edge=False, title_justify="left")
    t.add_column("모델", style="bold")
    t.add_column("차원", justify="right")
    t.add_column("recall@10", justify="right")
    t.add_column("배수", justify="right")
    t.add_column("recall@25", justify="right")
    t.add_column("배수", justify="right")
    t.add_column("인용쌍 유사도", justify="right")
    t.add_column("무작위", justify="right")
    best = max(r["lift@10"] for r in results)
    for r in sorted(results, key=lambda x: -x["lift@10"]):
        mark = "[green]%s[/]" % r["model"] if r["lift@10"] == best else r["model"]
        t.add_row(mark, str(r["dim"]),
                  "%.3f" % r["recall@10"], "%.0f×" % r["lift@10"],
                  "%.3f" % r["recall@25"], "%.0f×" % r["lift@25"],
                  "%.3f" % r["sim_linked_median"], "%.3f" % r["sim_random_median"])
    console.print()
    console.print(t)
    console.print()
    console.print("[dim]배수 = 무작위로 이웃을 골랐을 때 대비 몇 배인가.[/]")


@app.command()
def project(
    model: str = typer.Option("scincl", "--model", "-m"),
    corpus: str | None = CORPUS,
    neighbors: int = typer.Option(15, "--neighbors"),
    min_dist: float = typer.Option(0.1, "--min-dist"),
    refit: bool = typer.Option(False, "--refit", help="UMAP 전체 재학습 (좌표가 바뀐다)"),
) -> None:
    """PCA(50) → UMAP 2D/3D 좌표를 만든다."""
    from .analyze.project import project as run_project
    run_project(model, _corpus(corpus), n_neighbors=neighbors,
                min_dist=min_dist, refit=refit, log=console.print)


@app.command()
def sets() -> None:
    """정의된 쿼리 세트를 보여준다."""
    t = Table(box=None, pad_edge=False)
    t.add_column("세트", style="bold")
    t.add_column("연도")
    t.add_column("목표", justify="right")
    t.add_column("설명")
    for q in queries.SETS.values():
        t.add_row(q.name, "%d–%d" % (q.year_from, q.year_to),
                  format(q.target, ","), q.description)
    console.print(t)


@app.command()
def cluster(
    model: str = typer.Option("scincl", "--model", "-m"),
    corpus: str | None = CORPUS,
    map_id: str | None = MAP,
    space: str = typer.Option("umap10", "--space",
                              help="umap10(기본) | 2d | pca"),
    selection: str = typer.Option("eom", "--selection", help="eom | leaf"),
    min_cluster_size: int = typer.Option(30, "--min-size"),
    compare: bool = typer.Option(False, "--compare", help="2d와 pca를 둘 다 돌려 비교"),
) -> None:
    """HDBSCAN으로 덩어리를 나누고 c-TF-IDF로 라벨을 붙인다."""
    from .analyze.cluster import cluster as run_cluster, evaluate_clusters

    spaces = ["umap10", "2d", "pca"] if compare else [space]
    results = []
    for sp in spaces:
        console.print()
        console.print("[bold]── %s 공간 ──[/]" % sp)
        r = _scoped(lambda: run_cluster(
            model, run_id=map_id, corpus=corpus, space=sp,
            min_cluster_size=min_cluster_size, selection=selection,
            log=console.print))
        ev = evaluate_clusters(r["run_id"], log=console.print)
        results.append((sp, r, ev))

    t = Table(title="클러스터가 실제 인용 구조와 맞는가", box=None,
              pad_edge=False, title_justify="left")
    t.add_column("공간", style="bold")
    t.add_column("클러스터", justify="right")
    t.add_column("미분류", justify="right")
    t.add_column("같은 덩어리 인용률", justify="right")
    t.add_column("무작위 기준", justify="right")
    t.add_column("배수", justify="right")
    for sp, r, ev in results:
        t.add_row(sp, str(r["n_clusters"]), format(r["noise"], ","),
                  "%.3f" % ev["same_cluster_rate"], "%.3f" % ev["baseline"],
                  "%.1f×" % ev["lift"])
    console.print()
    console.print(t)


@app.command()
def hierarchy(
    model: str = typer.Option("scincl", "--model", "-m"),
    corpus: str | None = CORPUS,
    map_id: str | None = MAP,
    levels: str = typer.Option("8,18", "--levels", help="레벨별 노드 수. 잎은 자동"),
) -> None:
    """클러스터 위에 ward 트리를 세운다 (bottom-up, 2D 좌표)."""
    from .analyze.hierarchy import build
    ks = tuple(int(x) for x in levels.split(",") if x.strip())
    r = _scoped(lambda: build(model, run_id=map_id, corpus=corpus, levels=ks,
                              log=console.print))
    console.print()
    console.print("[green]완료[/] — 노드 %d개(잎 %d), 레벨 %s"
                  % (r["n_nodes"], r["n_leaves"],
                     " / ".join("%d개" % v for v in r["levels"].values())))


@app.command()
def name(
    model: str = typer.Option("scincl", "--model", "-m", help="임베딩 모델(run 선택용)"),
    corpus: str | None = CORPUS,
    map_id: str | None = MAP,
    backend: str = typer.Option("codex", "--backend", help="codex 또는 claude CLI"),
    llm: str | None = typer.Option(None, "--llm",
                                   help="모델. 기본 codex=gpt-6-luna, claude=opus"),
    internal_only: bool = typer.Option(False, "--internal-only",
                                       help="내부 노드만. 잎은 현재 라벨 유지"),
) -> None:
    """로그인된 codex/claude CLI로 클러스터와 계층 노드에 이름을 붙인다.

    불응집으로 판정된 노드는 지도 레벨에서 자식 둘로 갈라 보인다(tree_levels).
    원래 절단으로 되돌리려면 hierarchy 를 다시 돌린다.
    """
    from .analyze.naming import run as run_naming
    r = _scoped(lambda: run_naming(
        run_id=map_id, corpus=corpus, model_key=model, backend=backend,
        model=llm, leaves=not internal_only, log=console.print))
    console.print("[green]완료[/] — %d개, %.0f초, 레벨 %s"
                  % (r["n"], r["seconds"],
                     " / ".join("%d개" % v for v in r["levels"].values())))
    console.print("근거는 naming_audit 테이블에 남는다.")


@app.command()
def flow(
    model: str = typer.Option("scincl", "--model", "-m"),
    corpus: str | None = CORPUS,
    map_id: str | None = MAP,
    width: int = typer.Option(3, "--width", help="시간 창 폭(년)"),
    year_min: int = typer.Option(2014, "--from", help="이 해부터"),
    min_frac: float = typer.Option(0.012, "--min-frac",
                                   help="창 크기 대비 최소 클러스터 비율"),
) -> None:
    """시간 창별로 나눠 클러스터링하고 갈래 흐름을 계산한다."""
    from .analyze.flow import build
    r = _scoped(lambda: build(model, run_id=map_id, corpus=corpus, width=width,
                              year_min=year_min, min_cluster_frac=min_frac,
                              log=console.print))
    console.print()
    console.print("[green]완료[/] — 창 %d개, 클러스터 %d개, 흐름 %d개"
                  % (r["windows"], r["clusters"], r["flows"]))


@app.command()
def lineage(
    model: str = typer.Option("scincl", "--model", "-m"),
    corpus: str | None = CORPUS,
    map_id: str | None = MAP,
) -> None:
    """인용 DAG에 SPC 가중치를 매기고 메인패스를 뽑는다."""
    from .analyze.lineage import build
    r = _scoped(lambda: build(run_id=map_id, corpus=corpus, model_key=model,
                              log=console.print))
    console.print()
    console.print("[green]완료[/] — 노드 %s개, 엣지 %s개, 메인패스 %d편"
                  % (format(r["nodes"], ","), format(r["edges"], ","),
                     len(r["main_path"])))


@app.command()
def stats(corpus: str | None = CORPUS) -> None:
    """M0의 관문 — 초록 커버리지와 내부 인용 밀도를 잰다."""
    if not DB_PATH.exists():
        console.print("[red]DB가 없다.[/] 먼저 [bold]constellation collect[/]를 돌려라.")
        raise typer.Exit(1)

    cid = _corpus(corpus)
    conn = store.connect(read_only=True)
    try:
        st = store.stats(conn, cid)
    finally:
        conn.close()

    if not st.get("n_works"):
        console.print("[yellow]코퍼스가 비어 있다.[/]")
        raise typer.Exit(1)

    n = st["n_works"]
    console.print()
    console.print("[bold]코퍼스 %s[/]  %s편   %d–%d"
                  % (cid, format(n, ","), st["year_min"], st["year_max"]))
    console.print()

    # ── 관문 1: 초록 커버리지 ──
    pct = st["abstract_pct"]
    verdict, color = (
        ("그대로 진행", "green") if pct >= 90 else
        ("결손분 보강 필요", "yellow") if pct >= 70 else
        ("분야 교체 또는 Scopus 우선", "red")
    )
    console.print("[bold]초록 커버리지[/]  [%s]%.1f%%[/]  (%s/%s)  → %s"
                  % (color, pct, format(st["n_abstract"], ","), format(n, ","), verdict))

    # ── 관문 2: 내부 인용 밀도 ──
    ip = st["internal_pct"]
    icolor = "green" if st["avg_internal_refs"] >= 3 else "yellow" if st["avg_internal_refs"] >= 1 else "red"
    console.print("[bold]인용 엣지[/]      총 %s개, 그중 양 끝이 코퍼스 안: "
                  "[%s]%s개 (%.1f%%)[/]"
                  % (format(st["n_edges"], ","), icolor,
                     format(st["n_internal_edges"], ","), ip))
    console.print("               편당 참고문헌 %.1f개, 그중 내부 [%s]%.1f개[/]"
                  % (st["avg_refs"], icolor, st["avg_internal_refs"]))
    console.print("               코퍼스 안에서 인용받은 논문 %s편 (%.0f%%)"
                  % (format(st["n_cited_in_corpus"], ","),
                     st["n_cited_in_corpus"] / n * 100))

    # ── 연도별 ──
    console.print()
    t = Table(title="연도별 분포와 초록 커버리지", box=None, pad_edge=False, title_justify="left")
    t.add_column("연도")
    t.add_column("논문", justify="right")
    t.add_column("초록", justify="right")
    t.add_column("%", justify="right")
    t.add_column("")
    peak = max((r[1] for r in st["by_year"]), default=1)
    for year, cnt, abs_cnt in st["by_year"]:
        p = abs_cnt / cnt * 100 if cnt else 0
        bar = "█" * max(1, round(cnt / peak * 28))
        style = "green" if p >= 90 else "yellow" if p >= 70 else "red"
        t.add_row(str(year), format(cnt, ","), format(abs_cnt, ","),
                  "[%s]%.0f[/]" % (style, p), bar)
    console.print(t)

    if st["no_abs_by_year"]:
        worst = ", ".join("%d년 %s편" % (y, format(c, ",")) for y, c in st["no_abs_by_year"])
        console.print("[dim]초록 결손이 몰린 해: %s[/]" % worst)

    # ── 주제 / 학술지 ──
    console.print()
    t2 = Table(box=None, pad_edge=False)
    t2.add_column("주요 topic", style="bold")
    t2.add_column("편수", justify="right")
    t2.add_column("   ")
    t2.add_column("주요 게재처", style="bold")
    t2.add_column("편수", justify="right")
    topics = st["top_topics"][:10]
    venues = st["top_venues"][:10]
    for i in range(max(len(topics), len(venues))):
        tn, tc = topics[i] if i < len(topics) else ("", "")
        vn, vc = venues[i] if i < len(venues) else ("", "")
        t2.add_row(str(tn)[:34], format(tc, ",") if tc != "" else "", "",
                   str(vn)[:34], format(vc, ",") if vc != "" else "")
    console.print(t2)
    console.print()


corpus_app = typer.Typer(help="코퍼스 목록과 이전(adopt·import)")
app.add_typer(corpus_app, name="corpus")


@corpus_app.command("list")
def corpus_list() -> None:
    """코퍼스와 지도 목록."""
    from .db.scope import corpora
    conn = store.connect(read_only=True)
    try:
        rows = corpora(conn)
        maps = dict(conn.execute(
            "SELECT corpus_id, count(*) FROM runs WHERE kind = 'project' "
            "GROUP BY corpus_id").fetchall())
    finally:
        conn.close()
    t = Table(box=None, pad_edge=False)
    t.add_column("id", style="bold")
    t.add_column("이름")
    t.add_column("논문", justify="right")
    t.add_column("지도", justify="right")
    for cid, name, n in rows:
        t.add_row(cid, name, format(n, ","), str(maps.get(cid, 0)))
    console.print(t)
    if maps.get(None):
        console.print("[yellow]코퍼스 없는 지도 %d개[/] — constellation corpus adopt 로 배정한다"
                      % maps[None])


@corpus_app.command("adopt")
def corpus_adopt(
    corpus_id: str = typer.Option(..., "--id", help="코퍼스 id (ASCII kebab-case)"),
    name: str = typer.Option(..., "--name", help="표시 이름"),
) -> None:
    """소속 없는 논문과 코퍼스 없는 지도를 이 코퍼스에 배정한다."""
    from .db.migrate import adopt
    conn = store.connect()
    try:
        adopt(conn, corpus_id, name, log=console.print)
    finally:
        conn.close()


@corpus_app.command("import")
def corpus_import(
    path: str = typer.Argument(..., help="옮겨 올 분석 DB 파일"),
    corpus_id: str = typer.Option(..., "--id", help="코퍼스 id (ASCII kebab-case)"),
    name: str = typer.Option(..., "--name", help="표시 이름"),
) -> None:
    """다른 분석 DB와 그 옆의 embeddings/·models/를 현재 DB의 코퍼스로 옮긴다."""
    from pathlib import Path

    from .db.migrate import import_db
    conn = store.connect()
    try:
        import_db(conn, Path(path).expanduser(), corpus_id, name, log=console.print)
    finally:
        conn.close()


@corpus_app.command("drop")
def corpus_drop(
    corpus_id: str = typer.Option(..., "--id", help="지울 코퍼스 id"),
    only_building: bool = typer.Option(False, "--only-building",
                                       help="만드는 중(building)인 코퍼스만 지운다"),
) -> None:
    """코퍼스와 그 지도·산출물·투영 모델을 지운다. 공유 논문·인용·임베딩은 남긴다."""
    import shutil

    from .analyze.project import MODEL_DIR
    conn = store.connect()
    try:
        try:
            r = store.drop_corpus(conn, corpus_id, only_building=only_building)
        except ValueError as e:
            console.print("[red]%s[/]" % e)
            raise typer.Exit(1)
        conn.commit()
    finally:
        conn.close()
    shutil.rmtree(MODEL_DIR / corpus_id, ignore_errors=True)
    console.print("지웠다 — 지도·산출물 run %d개, 소속 %s편"
                  % (r["runs"], format(r["members"], ",")))


def _definition(path: str):
    import json
    from pathlib import Path

    from .ingest.definition import DefinitionError, parse
    try:
        return parse(json.loads(Path(path).expanduser().read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, DefinitionError) as e:
        console.print("[red]정의를 읽지 못했다:[/] %s" % e)
        raise typer.Exit(2)


def _json_out(value) -> None:
    import json
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")
    sys.stdout.flush()


@app.command()
def build(
    definition: str = typer.Option(..., "--definition", "-d", help="지도 정의 JSON 파일"),
    events: bool = typer.Option(False, "--events",
                                help="진행 상황을 표준 출력에 JSON 줄로 쓴다(앱 작업 실행기용)"),
) -> None:
    """정의 하나로 collect부터 lineage까지 실행해 새 지도를 만든다."""
    import json
    import os
    import signal

    from . import pipeline

    defn = _definition(definition)
    if events:
        # 이벤트만 표준 출력으로 낸다. 나머지 출력(print, 진행 막대, 라이브러리
        # 경고)은 표준 오류로 돌려 이벤트 줄이 섞이지 않게 한다.
        out = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
        os.dup2(2, 1)
        sys.stdout = sys.stderr

        def emit(ev):
            out.write(json.dumps(ev, ensure_ascii=False) + "\n")
    else:
        def emit(ev):
            kind = ev["event"]
            if kind == "stage":
                console.print("[bold]── %d/%d %s ──[/]" % (ev["index"] + 1, ev["count"], ev["stage"]))
            elif kind == "log":
                console.print(ev["message"])
            elif kind == "done":
                console.print("[green]완료[/] — 코퍼스 %s, 지도 %s, 이름 %s"
                              % (ev["corpus_id"], ev["map_id"], ev["naming"]))
            elif kind == "error":
                console.print("[red]%s 단계 실패:[/] %s" % (ev["stage"], ev["message"]))

    # 실행기가 취소하면 SIGTERM이 온다. SystemExit으로 바꿔 finally(연결 닫기)가 돌게 한다.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        pipeline.build(defn, emit)
    except pipeline.StageError as e:
        emit({"event": "error", "stage": e.stage, "message": str(e)})
        raise typer.Exit(1)


@app.command()
def estimate(
    definition: str = typer.Option(..., "--definition", "-d", help="지도 정의 JSON 파일"),
) -> None:
    """정의로 수집할 예상 편수를 JSON으로 쓴다."""
    from . import pipeline
    defn = _definition(definition)
    try:
        _json_out(asyncio.run(pipeline.estimate(defn, _settings())))
    except RuntimeError as e:
        console.print("[red]%s[/]" % e)
        raise typer.Exit(1)


@app.command()
def topics(
    query: str = typer.Argument(..., help="찾을 이름"),
    limit: int = typer.Option(8, "--limit", help="수준(필드·서브필드·토픽)별 최대 개수"),
) -> None:
    """OpenAlex 토픽·서브필드·필드를 이름으로 찾아 JSON으로 쓴다."""
    from . import pipeline
    try:
        _json_out(asyncio.run(pipeline.search_topics(_settings(), query, limit)))
    except RuntimeError as e:
        console.print("[red]%s[/]" % e)
        raise typer.Exit(1)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
