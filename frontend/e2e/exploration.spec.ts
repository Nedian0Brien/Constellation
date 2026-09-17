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
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(text!);
  const selectedURL = page.url();
  await page.getByRole("button", { name: "계층 트리", exact: true }).click();
  await expect(page.locator(".tree-wrap")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("selected")).toBe(
    new URL(selectedURL).searchParams.get("selected"),
  );
  await page.goBack();
  await expect(map).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(text!);
  await page
    .getByRole("button", { name: "상세 패널 전환", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "상세 패널 전환", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "상세 패널 전환", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
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
test("semantic zoom, reversibility, and list does not replace the map", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByTestId("research-map");
  await expect(map).toHaveAttribute("data-label-level", "field");
  await map.focus();
  // 하위 분야 단계: 화면에 영역 이름이 있으면 그것만, 없으면 논문 제목이 보인다.
  // 둘 중 하나는 반드시 켜져 있다. + 한 번에 0.5씩.
  for (let i = 0; i < 9; i++) await map.press("+");
  await expect(map).toHaveAttribute("data-label-level", "topic");
  const regions = await page.locator(".region-name[data-active=true]").count();
  const papers = await page.locator(".paper-name[data-active=true]").count();
  expect(regions > 0).not.toBe(papers > 0);
  expect(regions + papers).toBeGreaterThan(0);
  // 기준 배율의 2^5 이상에서는 영역 이름과 무관하게 논문 제목이 켜진다.
  for (let i = 0; i < 2; i++) await map.press("+");
  await expect(map).toHaveAttribute("data-label-level", "paper");
  const active = page.locator(".paper-name[data-active=true]");
  await expect(active.first()).toBeVisible();
  // 켜진 제목끼리는 겹치지 않는다 — 제목마다 제 배율에서 켜진다.
  const boxes = await active.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        t: e.getAttribute("title"),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      const overlap =
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.h &&
        b.y < a.y + a.h;
      expect(overlap, `${a.t} ↔ ${b.t}`).toBe(false);
    }
  // 이동해도 같은 제목이 켜져 있다. 화면 밖으로 나간 것만 빠진다.
  const before = await page
    .locator(".paper-name")
    .evaluateAll((els) =>
      els.map((e) => [e.getAttribute("title"), e.getAttribute("data-active")]),
    );
  await map.press("ArrowRight");
  await expect(active.first()).toBeVisible();
  const after = new Map(
    await page
      .locator(".paper-name")
      .evaluateAll((els) =>
        els.map((e) => [
          e.getAttribute("title"),
          e.getAttribute("data-active"),
        ]),
      ),
  );
  for (const [title, on] of before)
    if (after.has(title)) expect(after.get(title), title ?? "").toBe(on);
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
    localStorage.setItem("constellation.layout.v2", "{broken"),
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
  await page
    .getByRole("button", { name: clusters[0].label, exact: true })
    .click();
  await expect(page.getByTestId("inspector").locator("h2")).toHaveText(
    clusters[0].label,
  );
  expect(new URL(page.url()).searchParams.has("selected")).toBe(false);
});
