import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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
  const [app, layout, hosting] = await Promise.all([
    readFile(new URL("../app/WasteApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(app, /판정 보류/);
  assert.match(app, /AI 판정 근거/);
  assert.match(app, /서버로 전송하거나 저장하지 않아요/);
  assert.match(app, /환경부 공식 기준으로 교차 검증/);
  assert.match(layout, /applicationName:\s*"버림"/);
  assert.match(layout, /openGraph:/);
  assert.match(hosting, /"project_id"/);
});
