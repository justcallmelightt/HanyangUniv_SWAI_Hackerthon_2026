import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the WasteSuperApp landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="ko"/i);
  assert.match(html, /버림 — 잘 버리는 가장 빠른 방법/);
  assert.match(html, /버리는 순간까지/);
  assert.match(html, /들어가기/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("keeps AI safeguards and product metadata explicit", async () => {
  const [app, api, analysisApi, chatApi, layout, hosting, envExample] = await Promise.all([
    readFile(new URL("../app/WasteApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/collection-points/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze-waste/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/waste-chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(app, /판정 보류/);
  assert.match(app, /AI 판정 근거/);
  assert.match(app, /사진은 분석 중에만 Gemini로 전송되며 버림이 저장하지 않아요/);
  assert.match(app, /환경부 공식 기준으로 교차 검증/);
  assert.match(app, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(app, /facingMode:\s*\{ ideal: "environment" \}/);
  assert.match(app, /context\.drawImage\(video/);
  assert.match(app, /capture="environment"/);
  assert.match(app, /기기 카메라 열기/);
  assert.match(app, /fetch\("\/api\/analyze-waste"/);
  assert.match(app, /fetch\("\/api\/waste-chat"/);
  assert.match(app, /AI에게 더 물어보기/);
  assert.match(app, /버리는 과정 전체를/);
  assert.match(app, /mode: "integrated"/);
  assert.match(app, /사진 판정과 행동 요령, 현재 위치, 주변 수거함/);
  assert.match(analysisApi, /gemini-3\.1-flash-lite/);
  assert.match(analysisApi, /confidence >= 75/);
  assert.match(analysisApi, /"x-goog-api-key"/);
  assert.match(analysisApi, /"Cache-Control": "no-store"/);
  assert.match(chatApi, /gemini-3\.1-flash-lite/);
  assert.match(chatApi, /분석 상태가 uncertain이거나 근거가 부족하면/);
  assert.match(chatApi, /summary와 steps를 우선 사실로 사용/);
  assert.match(chatApi, /주변 수거 지점을 연결하는/);
  assert.match(chatApi, /목록에 없는 장소를 만들지 마라/);
  assert.match(chatApi, /slice\(-6\)/);
  assert.match(chatApi, /"Cache-Control": "no-store"/);
  assert.match(envExample, /^GEMINI_API_KEY=/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_GEMINI/);
  assert.doesNotMatch(app, /disabled=\{cameraStatus === "requesting"\}/);
  assert.match(app, /tile\.openstreetmap\.org/);
  assert.match(api, /overpass\/api\/interpreter/);
  assert.match(app, /fetchCollectionPlaces/);
  assert.match(app, /OpenStreetMap 실제 수거 지점/);
  assert.match(api, /waste_basket/);
  assert.match(api, /reverse_vending_machine/);
  assert.match(api, /OVERPASS_ENDPOINTS\.length/);
  assert.match(app, /OpenStreetMap 기반 주변 분리배출 장소 지도/);
  assert.match(app, /로그인 없이 둘러보기/);
  assert.match(app, /비밀번호는 버림 서버에 저장하지 않아요/);
  assert.match(app, /브라우저에는 공개용 키만 사용해요/);
  assert.match(app, /로그인 없이도 핵심 기능을 쓸 수 있어요/);
  assert.match(app, /signInWithPassword/);
  assert.match(app, /signUp/);
  assert.match(app, /signInWithOAuth/);
  assert.match(app, /rememberAnalysis/);
  assert.match(app, /loadRecordsFromUser/);
  assert.match(app, /참고용 탄소 절감 추정치/);
  assert.match(app, /guideAnalyses/);
  assert.match(app, /GuideSheet/);
  assert.match(app, /openNeighborhoodSetting/);
  assert.match(app, /toggleNotificationSetting/);
  assert.match(app, /openFavoriteCollection/);
  assert.match(app, /openHelpAndFeedback/);
  assert.match(app, /notificationActive/);
  assert.match(layout, /applicationName:\s*"버림"/);
  assert.match(layout, /openGraph:/);
  assert.match(hosting, /"project_id"/);
});

test("rejects invalid collection-point coordinates without calling upstream APIs", async () => {
  const response = await render("/api/collection-points?lat=invalid&lng=126.9");
  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.deepEqual(await response.json(), { error: "올바른 위치 좌표가 필요합니다." });
});
