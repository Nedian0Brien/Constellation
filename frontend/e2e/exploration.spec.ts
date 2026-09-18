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
  await expect(
    page.getByRole("region", { name: "논문 목록", exact: false }),
  ).toBeVisible();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-camera", before!);
  const title = page.getByTestId("paper-title").first();
  const text = await title.textContent();
  await title.click();
  await expect(
    page.getByRole("region", { name: "논문 목록", exact: false }),
  ).toBeHidden();
  // 논문을 고르면 지도의 선택 모드다: Dialog 없이 노드 둘레에 버튼 셋이 붙는다.
  // 딥링크로 새로고침해도 선택 모드로 시작한다. 상세 Dialog는 버튼으로 열고, 닫아도
  // 선택은 남는다. 지도의 Escape가 선택을 지운다.
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("inspector")).toBeHidden();
  expect(new URL(page.url()).searchParams.has("selected")).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("inspector")).toBeHidden();
  await page.getByRole("button", { name: "노드 상세정보", exact: true }).click();
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(text!);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspector")).toBeHidden();
  expect(new URL(page.url()).searchParams.has("selected")).toBe(true);
  await map.focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeHidden();
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
  await expect(
    page.getByRole("region", { name: "논문 목록", exact: false }),
  ).toContainText(data.total.toLocaleString());
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("button", { name: "논문 제목", exact: true }).click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/page=1/);
  await page
    .getByRole("textbox", { name: "논문 검색", exact: true })
    .fill("zzzz-no-paper-zzzz");
  await expect(
    page.getByRole("region", { name: "논문 목록", exact: false }),
  ).toContainText("검색 결과가 없습니다");
  await page.getByRole("textbox", { name: "논문 검색", exact: true }).fill("x");
  await expect(
    page.getByRole("region", { name: "논문 목록", exact: false }),
  ).toContainText("두 글자 이상");
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
// 논문 제목은 deck TextLayer가 그리므로 DOM에 없다. 지도 컨테이너가 E2E용으로 걸어 둔
// `__map`으로 켜진 제목(지도 좌표)과 deck의 투영·픽킹을 읽는다(MapView의 MapBridge).
// evaluate 안의 함수는 브라우저에서 돌므로 바깥 함수를 부르지 못한다.
interface Bridge {
  titles(): { id: string; x: number; y: number; dy: number; opacity: number }[];
  project(x: number, y: number): [number, number] | null;
  pick(x: number, y: number): string | null;
  degree(id: string): number;
}
type Bridged = HTMLElement & { __map?: Bridge };
test("semantic zoom, reversibility, and list does not replace the map", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByTestId("research-map");
  await expect(map).toHaveAttribute("data-label-level", "field");
  await map.focus();
  const titles = () => map.evaluate((el) => (el as Bridged).__map!.titles());
  const project = (x: number, y: number) =>
    map.evaluate(
      (el, at) => (el as Bridged).__map!.project(at[0], at[1]),
      [x, y],
    );
  const pick = (x: number, y: number) =>
    map.evaluate((el, at) => (el as Bridged).__map!.pick(at[0], at[1]), [x, y]);
  // 하위 분야 단계: 화면에 영역 이름이 있으면 그것만, 없으면 논문 제목이 보인다.
  // 둘 중 하나는 반드시 켜져 있다(둘 사이는 240ms 교차 페이드). + 한 번에 0.5씩.
  for (let i = 0; i < 9; i++) await map.press("+");
  await expect(map).toHaveAttribute("data-label-level", "topic");
  await expect
    .poll(async () => {
      const regions = await page
        .locator(".region-name[data-active=true]")
        .count();
      const papers = (await titles()).length;
      return regions > 0 !== papers > 0 && regions + papers > 0;
    })
    .toBe(true);
  // 기준 배율의 2^5 이상에서는 영역 이름과 무관하게 논문 제목이 켜진다. 켜진 제목끼리
  // 겹치지 않는 것은 단위 테스트(revealZooms)가 보장한다.
  for (let i = 0; i < 2; i++) await map.press("+");
  await expect(map).toHaveAttribute("data-label-level", "paper");
  await expect.poll(async () => (await titles()).length).toBeGreaterThan(0);
  // 이동해도 같은 제목이 켜져 있다. 이동 전에 켜진 제목 가운데 이동 뒤에도 화면 안에
  // 있는 것은 전부 그대로 켜져 있다 — 화면 밖으로 나간 것만 빠진다.
  const before = await titles();
  await map.press("ArrowRight");
  const box = (await map.boundingBox())!;
  const after = new Set((await titles()).map((t) => t.id));
  for (const t of before) {
    const [x, y] = (await project(t.x, t.y))!;
    if (x > 0 && x < box.width && y > 0 && y < box.height)
      expect(after.has(t.id), t.id).toBe(true);
  }
  // 제목을 클릭하면 그 논문이 선택된다. 화면 중앙 근처의 제목 하나를 고른다.
  const pin = await map.evaluate(
    (el, size) => {
      const b = (el as Bridged).__map!;
      for (const t of b.titles()) {
        const [x, y] = b.project(t.x, t.y)!;
        const dx = Math.abs(x - size[0] / 2),
          dy = Math.abs(y - size[1] / 2);
        if (dx > 40 && dx < size[0] / 4 && dy < size[1] / 4)
          return { ...t, px: x, py: y };
      }
      return null;
    },
    [box.width, box.height],
  );
  expect(pin).not.toBeNull();
  await page.mouse.click(box.x + pin!.px, box.y + pin!.py + pin!.dy + 5);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("selected"))
    .toBe(pin!.id);
  // 선택 모드: Dialog는 없고 버튼 셋과 인용 선이 붙는다. 지도의 Escape가 지운다.
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("inspector")).toBeHidden();
  await expect(map).toHaveAttribute("data-hover-id", pin!.id);
  await map.focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeHidden();
  expect(new URL(page.url()).searchParams.has("selected")).toBe(false);
  // 휠로 확대한 뒤 키로 확대해도 지도가 따라온다. deck이 주는 viewState의 내부 값
  // (zoomX·zoomY)을 그대로 저장하면 뒤의 키 확대가 배율 표시와 라벨만 바꾸고 지도는
  // 그대로라 라벨이 제자리에 못 박힌다. JS 투영이 가리키는 자리에 실제로 그 점이
  // 그려져 있어야 한다.
  const zoomOf = async () =>
    Number((await map.getAttribute("data-camera"))!.split(":")[0]);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const beforeWheel = await zoomOf();
  await page.mouse.wheel(0, 120);
  await expect.poll(zoomOf).not.toBe(beforeWheel);
  const [wheeled] = (await project(pin!.x, pin!.y))!;
  await map.press("+");
  await expect
    .poll(async () => {
      const [x, y] = (await project(pin!.x, pin!.y))!;
      return [Math.round(x) !== Math.round(wheeled), await pick(x, y)];
    })
    .toEqual([true, pin!.id]);
  // 점에 1초 머물면 run 안의 인용 관계가 선으로 나타나고 활성 라벨이 켜지며, 떼면
  // 사라진다. 300ms 안에는 켜지지 않는다(지나가는 점에 반응하지 않도록). 이웃이
  // 있는 제목 하나를 골라 그 점 위에 마우스를 둔다(인용 자료는 지도 뒤에 따로 온다).
  const linkedPin = () =>
    map.evaluate(
      (el, size) => {
        const b = (el as Bridged).__map!;
        for (const t of b.titles()) {
          const [x, y] = b.project(t.x, t.y)!;
          const degree = b.degree(t.id);
          if (
            degree > 0 &&
            x > 40 &&
            x < size[0] - 40 &&
            y > 40 &&
            y < size[1] - 40
          )
            return { id: t.id, x, y, degree };
        }
        return null;
      },
      [box.width, box.height],
    );
  await expect.poll(linkedPin).not.toBeNull();
  const linked = (await linkedPin())!;
  await page.mouse.move(box.x + linked.x, box.y + linked.y);
  await page.waitForTimeout(300);
  expect(await map.getAttribute("data-hover-id")).toBeNull();
  await expect(map).toHaveAttribute("data-hover-id", linked.id);
  await expect(map).toHaveAttribute("data-hover-links", String(linked.degree));
  await expect
    .poll(() => map.getAttribute("data-active-labels").then(Number))
    .toBeGreaterThan(0);
  // 캔버스 밖(위 도구 막대)으로 나가야 deck이 호버를 확실히 거둔다. 오른쪽 가장자리
  // 안쪽은 거기에도 점이 있을 수 있다.
  await page.mouse.move(box.x + box.width / 2, box.y - 20);
  await expect(map).toHaveAttribute("data-hover-links", "0");
  // 다시 선택해 "로컬 그래프 보기": 2홉 이웃까지 그리고(선이 늘어난다) 카메라를 그
  // 범위에 맞춘다. 다시 누르면 1홉으로.
  await page.mouse.click(box.x + linked.x, box.y + linked.y);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("selected"))
    .toBe(linked.id);
  await expect(map).toHaveAttribute("data-hover-links", String(linked.degree));
  await page.getByRole("button", { name: "로컬 그래프 보기", exact: true }).click();
  await expect(map).toHaveAttribute("data-local", "true");
  await expect
    .poll(() => map.getAttribute("data-hover-links").then(Number))
    .toBeGreaterThanOrEqual(linked.degree);
  await page.getByRole("button", { name: "로컬 그래프 보기", exact: true }).click();
  await expect(map).not.toHaveAttribute("data-local", "true");
  await expect(map).toHaveAttribute("data-hover-links", String(linked.degree));
  await map.focus();
  await page.keyboard.press("Escape");
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
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "노드 상세정보", exact: true }).click();
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
  // 저장값이 깨졌어도 지도에 없는 논문의 딥링크는 안내와 해제 버튼으로 시작한다.
  await page.goto("/?run=" + run + "&selected=missing");
  await expect(page.getByTestId("research-map")).toBeVisible();
  await expect(page.locator(".invalid-region")).toContainText(
    "선택한 논문은 현재 분석에 포함되지 않았습니다",
  );
  await expect(page.getByTestId("inspector")).toBeHidden();
  await page
    .locator(".invalid-region")
    .getByRole("button", { name: "선택 해제", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.has("selected")).toBe(false);
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
  await expect(
    page.getByRole("button", { name: "노드 상세정보", exact: true }),
  ).toBeVisible();
  // 논문이 선택된 채로 주제 라벨을 고르면 논문 선택은 지워지고 주제 상세가 열린다.
  await page
    .getByRole("button", { name: clusters[0].label, exact: true })
    .click();
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(
    clusters[0].label,
  );
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
