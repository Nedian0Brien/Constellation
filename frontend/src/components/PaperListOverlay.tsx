import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { X, ChevronLeft, ChevronRight, ArrowDown, ArrowUp } from "lucide-react";
import { fetchPapers, type PaperRow } from "../api";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { Button } from "./ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table";
import { DataState } from "./DataState";
const helper = createColumnHelper<PaperRow>();
export function PaperListOverlay() {
  const a = useAnalysis(),
    { state, update } = useExploration(),
    close = useRef<HTMLButtonElement>(null);
  const result = useQuery({
    queryKey: ["papers", a.filters, state.sort, state.order, state.page],
    queryFn: ({ signal }) =>
      fetchPapers(a.filters, state.sort, state.order, state.page, signal),
    enabled: !!a.run && a.valid,
  });
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    return () => {
      document
        .getElementById("paper-list-toggle")
        ?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (
      result.data &&
      result.data.total > 0 &&
      state.page > Math.ceil(result.data.total / 25)
    )
      update({ page: Math.ceil(result.data.total / 25) }, true);
  }, [result.data, state.page, update]);
  function sort(key: typeof state.sort) {
    update(
      {
        sort: key,
        order: state.sort === key && state.order === "desc" ? "asc" : "desc",
      },
      true,
    );
  }
  const columns = useMemo(
    () => [
      helper.accessor("title", {
        header: "논문 제목",
        cell: (c) => (
          <button
            className="paper-title-button"
            onClick={() => update({ selected: c.row.original.id, list: false })}
          >
            {c.getValue()}
          </button>
        ),
      }),
      helper.accessor("year", {
        header: "연도",
        cell: (c) => c.getValue() ?? "미상",
      }),
      helper.accessor("cited_by_count", {
        header: "피인용",
        cell: (c) => c.getValue()?.toLocaleString() ?? "미상",
      }),
    ],
    [update],
  );
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: result.data?.total,
  });
  return (
    <section
      className="paper-overlay"
      aria-labelledby="paper-list-heading"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          update({ list: false });
        }
      }}
    >
      <header className="overlay-header">
        <div>
          <span className="eyebrow">PAPER INDEX</span>
          <h2 id="paper-list-heading">
            논문 목록 <span>{result.data?.total.toLocaleString() ?? "—"}</span>
          </h2>
        </div>
        <Button
          ref={close}
          variant="ghost"
          size="icon"
          aria-label="논문 목록 닫기"
          onClick={() => update({ list: false })}
        >
          <X />
        </Button>
      </header>
      {!a.valid ? (
        <DataState title="검색어는 두 글자 이상 입력해주세요" />
      ) : result.isError || result.isPending ? (
        <DataState
          error={result.error}
          loading={result.isPending}
          retry={() => result.refetch()}
        />
      ) : result.data?.total === 0 ? (
        <DataState title="검색 결과가 없습니다" />
      ) : (
        <div className="paper-table">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((h) => {
                    const key =
                      h.id === "cited_by_count"
                        ? "cited"
                        : (h.id as "title" | "year");
                    return (
                      <TableHead
                        key={h.id}
                        aria-sort={
                          state.sort === key
                            ? state.order === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => sort(key)}
                        >
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                          {state.sort === key &&
                            (state.order === "asc" ? (
                              <ArrowUp />
                            ) : (
                              <ArrowDown />
                            ))}
                        </Button>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.original.id}
                  data-state={
                    state.selected === row.original.id ? "selected" : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <footer className="overlay-pagination">
        <span>연도 미상 논문 포함</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="이전 페이지"
          disabled={state.page <= 1 || result.isFetching}
          onClick={() => update({ page: state.page - 1 }, true)}
        >
          <ChevronLeft />
        </Button>
        <span>
          {state.page} /{" "}
          {Math.max(1, Math.ceil((result.data?.total ?? 0) / 25))}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="다음 페이지"
          disabled={
            !result.data ||
            state.page * 25 >= result.data.total ||
            result.isFetching
          }
          onClick={() => update({ page: state.page + 1 }, true)}
        >
          <ChevronRight />
        </Button>
      </footer>
    </section>
  );
}
