import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "./ui/empty";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { ApiError } from "../api";
export function DataState({
  error,
  loading,
  retry,
  title = "데이터가 없습니다",
}: {
  error?: Error | null;
  loading?: boolean;
  retry?: () => unknown;
  title?: string;
}) {
  if (loading)
    return (
      <div className="data-state" role="status">
        <span className="eyebrow">LOADING</span>
        <p>연구 데이터를 불러오는 중…</p>
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-2/3" />
      </div>
    );
  const missing = error instanceof ApiError && error.status === 404;
  if (!error || missing)
    return (
      <Empty className="data-state">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>
            {error?.message ??
              "검색 조건을 변경하거나 다른 분석을 선택해주세요."}
          </EmptyDescription>
        </EmptyHeader>
        {retry && (
          <EmptyContent>
            <Button variant="outline" onClick={() => retry()}>
              다시 시도
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  return (
    <div className="data-state">
      <Alert>
        <AlertTitle>
          {missing ? title : error ? "데이터를 불러오지 못했습니다" : title}
        </AlertTitle>
        <AlertDescription>
          {error?.message ?? "검색 조건을 변경하거나 다른 분석을 선택해주세요."}
        </AlertDescription>
      </Alert>
      {retry && (
        <Button variant="outline" onClick={() => retry()}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
