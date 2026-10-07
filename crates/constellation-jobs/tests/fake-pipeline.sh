#!/bin/sh
# 실행기 테스트용 가짜 `constellation` CLI. 정의 파일의 "mode"로 동작을 고른다.
data="$CONSTELLATION_DATA_DIR"
case "$1" in
  estimate) echo '{"expected": 123}'; exit 0 ;;
  topics) echo "[{\"id\": \"T1\", \"name\": \"$2\"}]"; exit 0 ;;
  corpus) echo "dropped $4 $5" >> "$data/drops.txt"; echo "지웠다"; exit 0 ;;
  papers)
    if [ "$2" = "search" ]; then
      # papers search Q --page N --source S
      echo "$7" > "$data/search-args.txt"
      echo "{\"query\": \"$3\", \"kind\": \"search\", \"total\": 2, \"page\": 1, \"items\": [{\"id\": \"openalex:W1\"}, {\"id\": \"openalex:W2\"}]}"
      exit 0
    fi
    # papers add|remove --map M -i FILE --check|--events
    map="$4"; file="$6"
    pmode=$(sed -n 's/.*"mode": *"\([a-z]*\)".*/\1/p' "$file")
    if [ "$7" = "--check" ]; then
      if [ "$pmode" = "bad" ]; then echo "ids는 1–200개여야 합니다." >&2; exit 2; fi
      echo "{\"map_id\": \"$map\", \"ids\": [\"W1\"], \"mode\": \"$pmode\"}"; exit 0
    fi
    echo "{\"event\": \"stage\", \"stage\": \"resolve\", \"index\": 0, \"count\": 5}"
    if [ "$pmode" = "fail" ]; then
      echo '{"event": "error", "stage": "resolve", "message": "찾지 못했다"}'; exit 1
    fi
    echo "{\"event\": \"done\", \"map_id\": \"$map\", \"result\": {\"added\": [{\"id\": \"openalex:W1\", \"cluster\": 3}], \"verb\": \"$2\"}}"
    exit 0
    ;;
esac
def="$3"
mode=$(sed -n 's/.*"mode": *"\([a-z]*\)".*/\1/p' "$def")
if [ "$4" = "--check" ]; then
  if [ "$mode" = "bad" ]; then echo "terms 값이 하나 이상 필요합니다." >&2; exit 2; fi
  echo "{\"kind\": \"terms\", \"mode\": \"$mode\"}"; exit 0
fi
echo "$CONSTELLATION_DB" > "$data/db-env.txt"
echo '{"event": "corpus", "corpus_id": "fake"}'
case "$mode" in
  ok)
    for i in 0 1 2 3 4 5 6 7 8 9; do
      echo "{\"event\": \"stage\", \"stage\": \"s$i\", \"index\": $i, \"count\": 10}"
    done
    echo '{"event": "progress", "stage": "s9", "done": 3, "total": 4}'
    echo '{"event": "log", "stage": "s9", "message": "로그 한 줄"}'
    printf 'bar 10%%\rbar 100%%\n' >&2
    echo '{"event": "done", "corpus_id": "fake", "map_id": "project-fake", "naming": "ctfidf"}'
    ;;
  fail)
    echo '{"event": "stage", "stage": "cluster", "index": 5, "count": 10}'
    echo '{"event": "error", "stage": "cluster", "message": "클러스터가 없다"}'
    exit 1
    ;;
  crash)
    echo '{"event": "stage", "stage": "embed", "index": 3, "count": 10}'
    echo "Traceback: 메모리 부족" >&2
    exit 3
    ;;
  slow)
    trap 'touch "$data/term.txt"; exit 143' TERM
    touch "$data/ready.txt"
    echo '{"event": "stage", "stage": "embed", "index": 3, "count": 10}'
    i=0
    while [ $i -lt 600 ]; do sleep 0.1; i=$((i+1)); done
    ;;
esac
