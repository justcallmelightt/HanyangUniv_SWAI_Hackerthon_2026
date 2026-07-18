const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type ChatMessage = { role: "user" | "assistant"; content: string };

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) return error("Gemini API 키가 아직 설정되지 않았습니다.", 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return error("대화 데이터 형식이 올바르지 않습니다.", 400);
  }

  const question = clean(body.question, 400);
  if (!question) return error("궁금한 내용을 입력해주세요.", 400);
  const integratedMode = body.mode === "integrated";

  const rawAnalysis = body.analysis && typeof body.analysis === "object" ? body.analysis as Record<string, unknown> : {};
  const analysis = {
    status: rawAnalysis.status === "confident" ? "confident" : "uncertain",
    itemName: clean(rawAnalysis.itemName, 80) || "품목 확인 필요",
    material: clean(rawAnalysis.material, 80) || "재질 확인 필요",
    category: clean(rawAnalysis.category, 100) || "판정 보류",
    confidence: Math.max(0, Math.min(100, Number(rawAnalysis.confidence) || 0)),
    summary: clean(rawAnalysis.summary, 200),
    evidence: Array.isArray(rawAnalysis.evidence) ? rawAnalysis.evidence.map((item) => clean(item, 120)).filter(Boolean).slice(0, 4) : [],
    steps: Array.isArray(rawAnalysis.steps) ? rawAnalysis.steps.flatMap((step) => {
      if (!step || typeof step !== "object") return [];
      const item = step as Record<string, unknown>;
      const title = clean(item.title, 80);
      const description = clean(item.description, 180);
      return title && description ? [{ title, description }] : [];
    }).slice(0, 5) : [],
    caution: clean(rawAnalysis.caution, 200),
  };

  const history: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages.flatMap((message): ChatMessage[] => {
      if (!message || typeof message !== "object") return [];
      const item = message as Record<string, unknown>;
      const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
      const content = clean(item.content, 500);
      return role && content ? [{ role, content }] : [];
    }).slice(-6)
    : [];

  const rawLocation = body.location && typeof body.location === "object" ? body.location as Record<string, unknown> : null;
  const location = rawLocation && Number.isFinite(Number(rawLocation.lat)) && Number.isFinite(Number(rawLocation.lng))
    ? { lat: Number(rawLocation.lat), lng: Number(rawLocation.lng) }
    : null;
  const places = Array.isArray(body.places) ? body.places.flatMap((place) => {
    if (!place || typeof place !== "object") return [];
    const item = place as Record<string, unknown>;
    const name = clean(item.name, 100);
    if (!name) return [];
    return [{
      name,
      type: clean(item.type, 100),
      distance: clean(item.distance, 40),
      walk: clean(item.walk, 40),
      materials: Array.isArray(item.materials) ? item.materials.map((value) => clean(value, 40)).filter(Boolean).slice(0, 8) : [],
    }];
  }).slice(0, 3) : [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: [
            integratedMode ? "너는 사진 판정, 행동 요령, 현재 위치, 주변 수거 지점을 연결하는 대한민국 생활폐기물 통합 도우미 '버림 AI'다." : "너는 대한민국 생활폐기물 분리배출을 돕는 후속 대화 AI다.",
            "제공된 사진 분석 결과 안에서만 물체를 지칭하고, 사진에서 확인하지 못한 오염·재질·표시를 지어내지 마라.",
            "최초 분석의 summary와 steps를 우선 사실로 사용하고 절대 반대로 답하지 마라. 사용자의 질문이 충돌하면 최초 행동 계획을 다시 설명하라.",
            "질문에 먼저 한 문장으로 직접 답한 뒤, 사용자가 지금 할 행동을 짧게 알려라.",
            integratedMode ? "사진 분석이 없으면 품목을 단정하지 말고 사진 촬영을 권하고, 위치가 없으면 위치 권한 허용을 요청하라. 수거 지점은 제공된 목록만 실제 장소로 말하고, 목록에 없는 장소를 만들지 마라." : "",
            integratedMode ? "답변 마지막에는 가능하면 '지금 할 일'을 한 문장으로 명확히 제시하라." : "",
            "분석 상태가 uncertain이거나 근거가 부족하면 단정하지 말고 확인할 사진 각도나 재질 표시를 구체적으로 요청하라.",
            "지역마다 기준이 다를 수 있는 내용은 지자체 안내 확인을 함께 말하라.",
            "한국어 존댓말로 4문장 이내, 마크다운 없이 답하라.",
          ].join(" ") }],
        },
        contents: [
          { role: "user", parts: [{ text: `현재 연결 정보: ${JSON.stringify({ hasAnalysis: Boolean(body.analysis), analysis, hasLocation: Boolean(location), location, nearbyCollectionPlaces: places })}` }] },
          { role: "model", parts: [{ text: "분석 결과를 기준으로만 답하고, 불확실하면 확인 행동을 요청하겠습니다." }] },
          ...history.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
          { role: "user", parts: [{ text: question }] },
        ],
        generationConfig: { temperature: 0.15, maxOutputTokens: 360 },
      }),
    });

    if (!response.ok) {
      const upstream = await response.text();
      console.error("Gemini waste chat error", response.status, upstream.slice(0, 400));
      if (response.status === 429) return error("무료 대화 한도가 잠시 가득 찼습니다. 잠시 후 다시 질문해주세요.", 429);
      return error("AI 대화 서버가 응답하지 않았습니다. 잠시 후 다시 시도해주세요.", 502);
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const answer = data.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text?.trim();
    if (!answer) return error("답변을 만들지 못했습니다. 질문을 조금 더 구체적으로 적어주세요.", 422);

    return Response.json({ answer: answer.slice(0, 900), model: GEMINI_MODEL }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return error("답변 시간이 초과되었습니다. 다시 질문해주세요.", 504);
    console.error("Waste chat failed", caught);
    return error("추가 질문을 처리하는 중 오류가 발생했습니다.", 500);
  } finally {
    clearTimeout(timeout);
  }
}
