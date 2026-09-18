import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { X, ArrowDown, ArrowUp } from "lucide-react";
import { fetchPapers, type PaperRow } from "../api";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
  CardFooter,
} from "./ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "./ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table";
import { DataState } from "./DataState";
import { cn } from "../lib/utils";
const helper = createColumnHelper<PaperRow>();
const pageSize = 25;
// 페이지 링크는 진짜 URL을 갖되 클릭은 SPA 전환(replace)으로 처리한다.
function pageHref(page: number) {
  const url = new URL(location.href);
  url.searchParams.set("page", String(page));
  return url.pathname + url.search;
}
const disabledLink = "pointer-events-none opacity-50";
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
      state.page > Math.ceil(result.data.total / pageSize)
    )
      update({ page: Math.ceil(result.data.total / pageSize) }, true);
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
          <Button
            variant="link"
            data-testid="paper-title"
            className="h-auto whitespace-normal px-0 text-left"
            onClick={() =>
              update({ selected: c.row.original.id, list: false, view: "map" })
            }
          >
            {c.getValue()}
          </Button>
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
  const pages = Math.max(1, Math.ceil((result.data?.total ?? 0) / pageSize));
  const atFirst = state.page <= 1 || result.isFetching;
  const atLast =
    !result.data ||
    state.page * pageSize >= result.data.total ||
    result.isFetching;
  return (
    <Card
      role="region"
      aria-labelledby="paper-list-heading"
      className="absolute bottom-5 left-5 z-10 max-h-[min(520px,calc(100%-75px))] w-[min(610px,calc(100%-44px))] gap-0 py-0 max-[960px]:bottom-3 max-[960px]:left-2.5 max-[960px]:w-[calc(100%-20px)]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          update({ list: false });
        }
      }}
    >
      <CardHeader className="border-b py-3">
        <span className="eyebrow">PAPER INDEX</span>
        <CardTitle id="paper-list-heading">
          논문 목록{" "}
          <Badge variant="secondary" className="ml-1 tabular-nums">
            {result.data?.total.toLocaleString() ?? "—"}
          </Badge>
        </CardTitle>
        <CardAction>
          <Button
            ref={close}
            variant="ghost"
            size="icon-sm"
            aria-label="논문 목록 닫기"
            onClick={() => update({ list: false })}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
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
        <CardContent className="min-h-0 flex-1 overflow-auto px-0">
          <Table className="table-fixed">
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
                        className={cn(
                          "sticky top-0 bg-card",
                          h.id === "title" ? "w-[68%] max-[960px]:w-[60%]" : "w-[16%] max-[960px]:w-[20%]",
                        )}
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
                              <ArrowUp data-icon="inline-end" />
                            ) : (
                              <ArrowDown data-icon="inline-end" />
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
                    <TableCell key={cell.id} className="align-top whitespace-normal">
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
        </CardContent>
      )}
      <CardFooter className="justify-between gap-2 py-2">
        <span className="text-xs text-muted-foreground">연도 미상 논문 포함</span>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text="이전"
                aria-label="이전 페이지"
                aria-disabled={atFirst || undefined}
                tabIndex={atFirst ? -1 : undefined}
                className={cn(atFirst && disabledLink)}
                href={pageHref(state.page - 1)}
                onClick={(e) => {
                  e.preventDefault();
                  if (!atFirst) update({ page: state.page - 1 }, true);
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <span
                className="px-2 text-xs text-muted-foreground tabular-nums"
                aria-live="polite"
              >
                {state.page} / {pages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                text="다음"
                aria-label="다음 페이지"
                aria-disabled={atLast || undefined}
                tabIndex={atLast ? -1 : undefined}
                className={cn(atLast && disabledLink)}
                href={pageHref(state.page + 1)}
                onClick={(e) => {
                  e.preventDefault();
                  if (!atLast) update({ page: state.page + 1 }, true);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </CardFooter>
    </Card>
  );
}
