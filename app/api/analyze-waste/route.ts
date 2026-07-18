const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type AnalysisStep = {
  title: string;
  description: string;
};

export type WasteAnalysis = {
  status: "confident" | "uncertain";
  itemName: string;
  material: string;
  category: string;
  confidence: number;
  summary: string;
  evidence: string[];
  steps: AnalysisStep[];
  followUp: string[];
  caution: string;
  model: string;
};

const responseSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["confident", "uncertain"],
      description: "confident only when the item and material are clearly visible; otherwise uncertain",
    },
    itemName: { type: "string", description: "Short Korean name of the visible waste item" },
    material: { type: "string", description: "Visible or inferred material in Korean" },
    category: { type: "string", description: "Korean disposal category" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string", description: "One concise Korean action summary" },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
      description: "Only visual clues actually visible in the image",
    },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    followUp: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string" },
      description: "Specific Korean reshoot requests. Empty-looking scenes must request a clearer photo.",
    },
    caution: { type: "string", description: "Short safety or local-rule caveat in Korean" },
  },
  required: ["status", "itemName", "material", "category", "confidence", "summary", "evidence", "steps", "followUp", "caution"],
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function cleanText(value: unknown, fallback: string, maxLength = 160) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function cleanStringArray(value: unknown, fallback: string[], maxItems: number) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, 140));
  return items.length ? items : fallback;
}

function normalizeAnalysis(value: unknown): WasteAnalysis {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0)));
  const requestedStatus = raw.status === "confident" ? "confident" : "uncertain";
  const status = requestedStatus === "confident" && confidence >= 75 ? "confident" : "uncertain";
  const steps = Array.isArray(raw.steps)
    ? raw.steps.flatMap((step): AnalysisStep[] => {
      if (!step || typeof step !== "object") return [];
      const item = step as Record<string, unknown>;
      const title = cleanText(item.title, "현장 기준을 확인해요", 80);
      const description = cleanText(item.description, "지역별 분리배출 안내를 확인해주세요.", 160);
      return [{ title, description }];
    }).slice(0, 5)
    : [];

  return {
    status,
    itemName: cleanText(raw.itemName, status === "confident" ? "재활용품" : "품목 확인 필요", 80),
    material: cleanText(raw.material, "재질 확인 필요", 80),
    category: cleanText(raw.category, "판정 보류", 80),
    confidence,
    summary: cleanText(raw.summary, status === "confident" ? "내용물을 비우고 지역 배출 기준을 확인하세요." : "추측하지 않고 사진을 다시 확인할게요."),
    evidence: cleanStringArray(raw.evidence, ["사진에서 확인 가능한 단서가 충분하지 않아요"], 4),
    steps: steps.length ? steps : [{ title: "표시를 확인해요", description: "제품 뒷면의 재질 표시와 지역 배출 기준을 확인해주세요." }],
    followUp: cleanStringArray(raw.followUp, ["물건 전체와 뒷면 재질 표시가 보이도록 다시 찍어주세요"], 3),
    caution: cleanText(raw.caution, "지역마다 분리배출 기준이 다를 수 있으니 지자체 안내를 함께 확인해주세요."),
    model: GEMINI_MODEL,
  };
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return jsonError("Gemini API 키가 아직 설정되지 않았습니다.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("사진 데이터 형식이 올바르지 않습니다.", 400);
  }

  const imageDataUrl = body && typeof body === "object" ? (body as { imageDataUrl?: unknown }).imageDataUrl : undefined;
  if (typeof imageDataUrl !== "string") return jsonError("분석할 사진이 필요합니다.", 400);

  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return jsonError("JPEG, PNG 또는 WebP 사진만 분석할 수 있습니다.", 415);

  const [, mimeType, base64Data] = match;
  const approximateBytes = Math.floor((base64Data.length * 3) / 4);
  if (approximateBytes > MAX_IMAGE_BYTES) return jsonError("사진 용량을 4MB 이하로 줄여주세요.", 413);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: [
                "너는 대한민국 생활폐기물 분리배출을 돕는 보수적인 시각 판독 AI다.",
                "사진 속에서 실제로 보이는 쓰레기 한 개를 식별하고 한국어로 답하라.",
                "보이지 않는 재질 표시나 오염 상태를 만들어내지 말고, 물체가 흐리거나 여러 개이거나 재질이 불명확하면 반드시 uncertain으로 판정하라.",
                "confidence가 75 미만이면 uncertain이어야 한다.",
                "행동 요령은 일반적인 대한민국 분리배출 원칙으로 작성하되 지역별 차이가 있음을 caution에 밝혀라.",
                "followUp에는 정확도를 높이기 위해 사용자가 다음 사진에서 해야 할 구체적인 행동을 적어라.",
              ].join(" "),
            },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1200,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    if (!response.ok) {
      const upstream = await response.text();
      console.error("Gemini API error", response.status, upstream.slice(0, 500));
      if (response.status === 429) return jsonError("무료 분석 한도가 잠시 가득 찼습니다. 잠시 후 다시 시도해주세요.", 429);
      return jsonError("AI 분석 서버가 응답하지 않았습니다. 잠시 후 다시 시도해주세요.", 502);
    }

    const gemini = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    const responseText = gemini.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    if (!responseText) {
      const blocked = gemini.promptFeedback?.blockReason || gemini.candidates?.[0]?.finishReason;
      console.error("Gemini returned no text", blocked);
      return jsonError("사진을 안전하게 분석할 수 없습니다. 다른 각도로 다시 찍어주세요.", 422);
    }

    return Response.json({ analysis: normalizeAnalysis(JSON.parse(responseText)) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return jsonError("사진 분석 시간이 초과되었습니다. 다시 시도해주세요.", 504);
    }
    console.error("Waste analysis failed", error);
    return jsonError("사진 분석 중 오류가 발생했습니다.", 500);
  } finally {
    clearTimeout(timeout);
  }
}
