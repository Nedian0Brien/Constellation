import { test, expect } from "@playwright/test";
const run = "project-scincl-20260826T084511Z";
test("real corpus: map, list, selection, history, reload and panels", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByTestId("research-map");
  await expect(map).toBeVisible();
  await expect(page.locator(".workspace-status")).toContainText("10,604");
  const before = await map.getAttribute("data-camera");
  await page
    .getByRole("button", { name: "논문 목록 열기", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "논문 목록", exact: false })).toBeVisible();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-camera", before!);
  const title = page.getByTestId("paper-title").first();
  const text = await title.textContent();
  await title.click();
  await expect(page.getByRole("region", { name: "논문 목록", exact: false })).toBeHidden();
  // 상세는 Dialog다. 딥링크로 새로고침해도 열린 채이고, Escape는 선택을 지운다.
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(text!);
  expect(new URL(page.url()).searchParams.has("selected")).toBe(true);
  await page.reload();
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(text!);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspector")).toBeHidden();
  expect(new URL(page.url()).searchParams.has("selected")).toBe(false);
  await expect(map).toBeVisible();
  // 에이전트 패널: 헤더 버튼으로 열고, 새로고침 뒤에도 열린 채이며, ✕로 닫는다.
  const chatToggle = page.getByRole("button", {
    name: "에이전트 패널 전환",
    exact: true,
  });
  await chatToggle.click();
  await expect(page.getByTestId("agent-chat")).toBeVisible();
  await expect(chatToggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("agent-chat")).toBeVisible();
  await page
    .getByRole("button", { name: "에이전트 패널 닫기", exact: true })
    .click();
  await expect(page.getByTestId("agent-chat")).toBeHidden();
  await page.reload();
  await expect(chatToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("agent-chat")).toBeHidden();
  // 탐색 사이드바: 헤더 버튼으로 접고, 새로고침 뒤에도 접힌 채이며, ⌘B로 다시 편다.
  const nav = page.locator('[data-slot="sidebar"][data-side="left"]');
  await page
    .getByRole("button", { name: "탐색 패널 전환", exact: true })
    .click();
  await expect(nav).toHaveAttribute("data-state", "collapsed");
  await expect(nav).toHaveAttribute("data-collapsible", "icon");
  await page.reload();
  await expect(nav).toHaveAttribute("data-state", "collapsed");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(nav).toHaveAttribute("data-state", "expanded");
});
test("query filters, empty results, sort, paging and scoped IDs", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("research-map")).toBeVisible();
  await page
    .getByRole("textbox", { name: "논문 검색", exact: true })
    .fill("retrieval");
  await expect(page).toHaveURL(/q=retrieval/);
  await page
    .getByRole("button", { name: "논문 목록 열기", exact: true })
    .click();
  await expect(page.getByTestId("paper-title").first()).toBeVisible();
  const data = await (
    await request.get("/api/matches", { params: { run, q: "retrieval" } })
  ).json();
  await expect(page.getByRole("region", { name: "논문 목록", exact: false })).toContainText(
    data.total.toLocaleString(),
  );
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("button", { name: "논문 제목", exact: true }).click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/page=1/);
  await page
    .getByRole("textbox", { name: "논문 검색", exact: true })
    .fill("zzzz-no-paper-zzzz");
  await expect(page.getByRole("region", { name: "논문 목록", exact: false })).toContainText(
    "검색 결과가 없습니다",
  );
  await page.getByRole("textbox", { name: "논문 검색", exact: true }).fill("x");
  await expect(page.getByRole("region", { name: "논문 목록", exact: false })).toContainText("두 글자 이상");
});
test("analysis views and missing artifacts in a different model", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("research-map")).toBeVisible();
  for (const [name, selector] of [
    ["갈래 흐름", ".flow-wrap"],
    ["인용 계보", ".flow-wrap"],
    ["3D 별자리", ".map-wrap"],
  ] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.locator(selector).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "갈래 흐름", exact: true }).click();
  await page.getByRole("combobox", { name: "임베딩 모델" }).click();
  await page.getByRole("option", { name: "specter", exact: true }).click();
  await expect(page.locator(".analysis-stage")).toContainText(
    "결과가 없습니다",
  );
});
test("semantic zoom, reversibility, and list does not replace the map", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByTestId("research-map");
  await expect(map).toHaveAttribute("data-label-level", "field");
  await map.focus();
  for (let i = 0; i < 7; i++) await map.press("+");
  await expect(map).toHaveAttribute("data-label-level", "paper");
  await expect(
    page.locator(".paper-name[data-active=true]").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "논문 목록 열기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "논문 목록 닫기", exact: true })
    .press("Escape");
  await expect(map).toHaveAttribute("data-label-level", "paper");
  await page
    .getByRole("button", { name: "지도 전체 보기", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-label-level", "field");
});
test("mobile overlays and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("research-map")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "탐색 패널 전환", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "연구 지도", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page
    .getByRole("button", { name: "논문 목록 열기", exact: true })
    .click();
  await page.getByTestId("paper-title").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("inspector").locator("h2")).toBeVisible();
});
test("failed request can recover without resetting URL state", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/map?*", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "테스트 연결 오류" }),
        })
      : route.continue(),
  );
  await page.goto("/?q=retrieval");
  await expect(page.getByText("테스트 연결 오류")).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByTestId("research-map")).toBeVisible();
  await expect(page).toHaveURL(/q=retrieval/);
});
test("late old-model response cannot overwrite the active run", async ({
  page,
}) => {
  const slow = "project-bge-m3-20260826T090716Z",
    fast = "project-specter-20260826T090605Z";
  await page.route("**/api/map?*", async (route) => {
    if (route.request().url().includes(slow)) {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 700));
      await route.fulfill({ response }).catch(() => {});
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByTestId("research-map")).toBeVisible();
  await page.getByRole("combobox", { name: "임베딩 모델" }).click();
  await page.getByRole("option", { name: "bge-m3", exact: true }).click();
  await page.getByRole("combobox", { name: "임베딩 모델" }).click();
  await page.getByRole("option", { name: "specter", exact: true }).click();
  await expect(page.getByTestId("research-map")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(fast));
  await expect(page.locator(".workspace-status")).toContainText("specter");
  await page.waitForTimeout(850);
  await expect(page.locator(".workspace-status")).toContainText("specter");
  await expect(
    page.getByRole("combobox", { name: "임베딩 모델" }),
  ).toContainText("specter");
});
test("unknown selection and malformed persisted layout remain recoverable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("constellation.layout.v3", "{broken"),
  );
  await page.goto("/?node=999999&page=-5&view=bad");
  await expect(page.getByTestId("research-map")).toBeVisible();
  await expect(page.locator(".invalid-region")).toBeVisible();
  await page
    .locator(".invalid-region")
    .getByRole("button", { name: "선택 해제", exact: true })
    .click();
  await expect(page.locator(".invalid-region")).toBeHidden();
  // 저장값이 깨졌어도 선택이 있는 딥링크는 인스펙터를 연 채로 시작한다.
  await page.goto("/?run=" + run + "&selected=missing");
  await expect(page.getByTestId("research-map")).toBeVisible();
  await expect(page.getByTestId("inspector")).toContainText(
    "현재 분석에 포함되지 않은 논문입니다",
  );
});
test("explicit region selection replaces paper detail with the real cluster", async ({
  page,
  request,
}) => {
  const clusters = await (
    await request.get("/api/clusters", { params: { run } })
  ).json();
  await page.goto("/");
  await expect(page.getByTestId("research-map")).toBeVisible();
  await page
    .getByRole("button", { name: "논문 목록 열기", exact: true })
    .click();
  await page.getByTestId("paper-title").first().click();
  await expect(page.getByTestId("inspector").locator("h2")).toBeVisible();
  // Dialog가 지도를 덮으므로 먼저 닫는다(선택 해제). 그다음 주제 라벨을 고른다.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspector")).toBeHidden();
  await page
    .getByRole("button", { name: clusters[0].label, exact: true })
    .click();
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(clusters[0].label);
  expect(new URL(page.url()).searchParams.has("selected")).toBe(false);
  expect(new URL(page.url()).searchParams.has("cluster")).toBe(true);
});
test("agent chat: canned stream renders, runs a frontend tool, and survives reload", async ({
  page,
}) => {
  // 실제 Claude 없이 프론트 쪽 파이프라인만 검사한다. 서버 응답은 assistant-ui
  // 데이터 스트림 형식으로 흉내 내고, 웹뷰가 실행한 zoom 도구의 결과가
  // tool-result 로 돌아오는지, 지도가 실제로 움직이는지 본다.
  const results: { toolCallId: string; result: unknown }[] = [];
  await page.route("**/api/agent/tool-result", async (route) => {
    results.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, delivered: true } });
  });
  await page.route("**/api/agent", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-vercel-ai-data-stream": "v1",
      },
      body: [
        'b:{"toolCallId":"toolu_e2e","toolName":"zoom"}',
        'c:{"toolCallId":"toolu_e2e","argsTextDelta":"{\\"steps\\":2}","isFinal":true}',
        '0:"확대했습니다."',
        "",
      ].join("\n"),
    }),
  );
  await page.goto("/");
  const map = page.getByTestId("research-map");
  await expect(map).toBeVisible();
  const before = await map.getAttribute("data-camera");
  await page
    .getByRole("button", { name: "에이전트 패널 전환", exact: true })
    .click();
  const chat = page.getByTestId("agent-chat");
  await expect(chat).toContainText("무엇을 찾아볼까요?");
  // 기본 입력 경로는 Enter 다(Shift+Enter 는 줄바꿈). 버튼은 있는지만 본다.
  const input = chat.getByRole("textbox", { name: "메시지 입력" });
  await input.fill("확대해 줘");
  await expect(chat.getByRole("button", { name: "보내기", exact: true })).toBeEnabled();
  await input.press("Enter");
  await expect(chat).toContainText("확대했습니다.");
  await expect.poll(() => results.length).toBe(1);
  expect(results[0]).toMatchObject({
    toolCallId: "toolu_e2e",
    result: { steps: 2 },
  });
  await expect(map).not.toHaveAttribute("data-camera", before!);
  await page.reload();
  await expect(page.getByTestId("agent-chat")).toContainText("확대했습니다.");
  await page.getByRole("button", { name: "새 대화", exact: true }).click();
  await expect(page.getByTestId("agent-chat")).toContainText("무엇을 찾아볼까요?");
  await expect(page.getByTestId("agent-chat")).not.toContainText("확대했습니다.");
});
