const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const SEARCH_RADIUS_METERS = 15_000;

function isCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function buildQuery(lat: number, lng: number) {
  return `[out:json][timeout:20];(
    nwr(around:${SEARCH_RADIUS_METERS},${lat},${lng})["amenity"="recycling"]["access"!="private"];
    nwr(around:10000,${lat},${lng})["amenity"="waste_disposal"]["access"!="private"];
    node(around:5000,${lat},${lng})["amenity"="waste_basket"]["waste"!="dog_excrement"];
    nwr(around:${SEARCH_RADIUS_METERS},${lat},${lng})["vending"="reverse_vending_machine"];
  );out center 250;`;
}

async function fetchEndpoint(endpoint: string, query: string, requestSignal: AbortSignal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  requestSignal.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "WasteSuperApp/1.0 (+https://beorim-waste-guide.justcallmelight.chatgpt.site)",
        "X-Requested-With": "WasteSuperApp",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    const data = await response.json() as { elements?: unknown[] };
    if (!Array.isArray(data.elements)) throw new Error("Invalid Overpass response");
    return data.elements;
  } finally {
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", onAbort);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  if (!isCoordinate(lat, -90, 90) || !isCoordinate(lng, -180, 180)) {
    return Response.json({ error: "올바른 위치 좌표가 필요합니다." }, { status: 400 });
  }

  const query = buildQuery(lat, lng);
  const failures: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await fetchEndpoint(endpoint, query, request.signal);
      return Response.json(
        {
          elements,
          meta: {
            source: "OpenStreetMap Overpass API",
            radiusKm: SEARCH_RADIUS_METERS / 1_000,
            fetchedAt: new Date().toISOString(),
            fallbackServers: OVERPASS_ENDPOINTS.length,
          },
        },
        {
          headers: {
            "Cache-Control": "public, max-age=300, s-maxage=900",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    } catch (error) {
      if (request.signal.aborted) break;
      failures.push(error instanceof Error ? error.message : "Unknown error");
    }
  }

  return Response.json(
    {
      error: "수거 지점 데이터 서버가 일시적으로 혼잡합니다.",
      retryable: true,
      attempts: failures.length,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
