"use client";

import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BottleWine as Bottle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Droplets,
  ExternalLink,
  Eye,
  EyeOff,
  GlassWater,
  History,
  Home,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LocateFixed,
  LogIn,
  LogOut,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  Navigation,
  PackageOpen,
  Recycle,
  RotateCcw,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Circle, CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase-client";
import {
  type MonthlyStats,
  type WasteRecord,
  addRecord,
  computeMonthlyStats,
  createRecord,
  formatRecordTime,
  loadGuestRecords,
  loadRecordsFromUser,
  saveGuestRecords,
} from "./waste-stats";

type Tab = "home" | "map" | "ai" | "history" | "profile";
type ScanState = "ready" | "analyzing" | "result" | "uncertain";
type CameraStatus = "requesting" | "live" | "denied" | "unsupported" | "error";
type LocationStatus = "idle" | "loading" | "granted" | "denied" | "unavailable";
type CollectionStatus = "demo" | "loading" | "success" | "empty" | "error";
type UserLocation = { lat: number; lng: number; accuracy: number };
type CollectionMeta = { source: string; radiusKm: number; fetchedAt: string; fallbackServers: number };
type AuthMode = "login" | "signup";
type AppNotice = { title: string; body: string };

type WasteAnalysis = {
  status: "confident" | "uncertain";
  itemName: string;
  material: string;
  category: string;
  confidence: number;
  summary: string;
  evidence: string[];
  steps: Array<{ title: string; description: string }>;
  followUp: string[];
  caution: string;
  model: string;
};

type WasteChatMessage = { role: "user" | "assistant"; content: string };

const sampleAnalysis: WasteAnalysis = {
  status: "confident",
  itemName: "투명 페트병",
  material: "무색 PET",
  category: "투명 페트병 전용 배출",
  confidence: 92,
  summary: "비우고, 헹구고, 라벨을 뗀 뒤 찌그러뜨려 배출하세요.",
  evidence: ["투명한 음료 용기 형태", "재질 표시 PET 01", "분리 가능한 라벨"],
  steps: [
    { title: "내용물을 완전히 비워요", description: "남아 있는 음료는 싱크대에 버려주세요." },
    { title: "물로 한 번 가볍게 헹궈요", description: "세제까지 사용할 필요는 없어요." },
    { title: "라벨을 떼어 비닐류로 분리해요", description: "접착제가 남아도 괜찮아요." },
    { title: "찌그러뜨린 뒤 뚜껑을 닫아요", description: "투명 페트병 전용 수거함에 넣어주세요." },
  ],
  followUp: ["용기 뒷면의 재질 표시가 보이도록 찍어주세요", "흔들리지 않게 물건 가까이에서 찍어주세요"],
  caution: "지역별 배출 기준이 다를 수 있으니 지자체 안내를 함께 확인해주세요.",
  model: "demo",
};

const guideAnalyses: Record<"glass" | "receipt", WasteAnalysis> = {
  glass: {
    status: "confident", itemName: "깨진 유리", material: "유리(파손)", category: "일반쓰레기 · 안전하게 감싸 배출", confidence: 96,
    summary: "깨진 유리는 재활용 수거함이 아니라 신문지에 두껍게 감싸 일반쓰레기로 배출해요.",
    evidence: ["날카로운 파손 단면", "원래 용기 형태가 훼손됨", "수거 작업자 부상 위험"],
    steps: [
      { title: "두꺼운 종이로 감싸요", description: "목장갑을 끼고 맨손으로 만지지 마세요." },
      { title: "테이프로 단단히 고정해요", description: "봉투나 상자에 한 번 더 담으면 안전해요." },
      { title: "깨진 유리 주의라고 표시해요", description: "수거하는 분이 미리 알아볼 수 있게 적어주세요." },
      { title: "종량제 봉투로 배출해요", description: "유리병 수거함에는 넣지 마세요." },
    ], followUp: [], caution: "양이 많거나 크면 지자체 배출 기준을 확인하세요.", model: "guide",
  },
  receipt: {
    status: "confident", itemName: "영수증", material: "감열지(코팅 종이)", category: "일반쓰레기 · 재활용 불가", confidence: 94,
    summary: "대부분의 영수증은 코팅된 감열지라 종이 재활용이 어려워 일반쓰레기로 배출해요.",
    evidence: ["매끈한 감열 코팅 표면", "열로 글자가 나타나는 인쇄 방식", "일반 종이와 다른 재질"],
    steps: [
      { title: "종이 수거함에 넣지 않아요", description: "재활용 공정에서 이물질이 될 수 있어요." },
      { title: "개인정보 부분을 잘라요", description: "카드번호 등이 보이면 잘게 잘라주세요." },
      { title: "종량제 봉투로 배출해요", description: "가능하면 전자영수증을 이용해요." },
    ], followUp: [], caution: "재활용 가능 표시가 있는 친환경 영수증은 표기를 우선 확인하세요.", model: "guide",
  },
};

type Place = {
  id: string;
  name: string;
  type: string;
  distance: string;
  walk: string;
  status: string;
  tone: "green" | "black" | "blue";
  lat: number;
  lng: number;
  materials: string[];
  source: "demo" | "osm";
  sourceUrl?: string;
};

const demoPlaces: Place[] = [
  {
    id: "demo-1",
    name: "관악구 스마트 분리수거함",
    type: "캔 · 페트 · 투명병",
    distance: "120m",
    walk: "도보 2분",
    status: "지금 이용 가능",
    tone: "green",
    lat: 37.4669,
    lng: 126.9306,
    materials: ["캔", "페트병", "유리병"],
    source: "demo",
  },
  {
    id: "demo-2",
    name: "미림마이스터고 분리배출존",
    type: "종이 · 플라스틱 · 일반",
    distance: "350m",
    walk: "도보 5분",
    status: "18:00까지",
    tone: "black",
    lat: 37.4658,
    lng: 126.9297,
    materials: ["종이", "플라스틱", "일반쓰레기"],
    source: "demo",
  },
  {
    id: "demo-3",
    name: "신림동 주민센터 수거함",
    type: "폐건전지 · 형광등 · 소형가전",
    distance: "640m",
    walk: "도보 9분",
    status: "24시간",
    tone: "blue",
    lat: 37.4681,
    lng: 126.9325,
    materials: ["폐건전지", "형광등", "소형가전"],
    source: "demo",
  },
];

const fallbackCenter: [number, number] = [37.4669, 126.9306];

function distanceInMeters(from: UserLocation, place: Place) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(place.lat - from.lat);
  const lngDelta = toRadians(place.lng - from.lng);
  const startLat = toRadians(from.lat);
  const endLat = toRadians(place.lat);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number) {
  return meters < 1_000 ? `${Math.round(meters / 10) * 10}m` : `${(meters / 1_000).toFixed(1)}km`;
}

type OverpassElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const materialTags: Array<[string, string]> = [
  ["recycling:plastic_bottles", "페트병"],
  ["recycling:plastic", "플라스틱"],
  ["recycling:plastic_packaging", "플라스틱 포장재"],
  ["recycling:cans", "캔"],
  ["recycling:glass_bottles", "유리병"],
  ["recycling:paper", "종이"],
  ["recycling:cardboard", "골판지"],
  ["recycling:batteries", "폐건전지"],
  ["recycling:small_appliances", "소형가전"],
  ["recycling:electrical_appliances", "전자제품"],
  ["recycling:clothes", "의류"],
  ["recycling:shoes", "신발"],
  ["recycling:beverage_cartons", "종이팩"],
];

function materialsFromTags(tags: Record<string, string>) {
  const materials = materialTags.filter(([key]) => tags[key] === "yes").map(([, label]) => label);
  if (tags.amenity === "waste_disposal" && materials.length === 0) materials.push("생활폐기물");
  if (tags.amenity === "waste_basket" && materials.length === 0) materials.push("일반쓰레기");
  if (tags.vending === "reverse_vending_machine" && materials.length === 0) materials.push("페트병", "캔");
  return materials;
}

function placeName(tags: Record<string, string>, materials: string[]) {
  if (tags["name:ko"] || tags.name) return tags["name:ko"] || tags.name;
  if (materials.includes("의류")) return "의류 수거함";
  if (tags.vending === "reverse_vending_machine") return "재활용품 무인회수기";
  if (tags.amenity === "waste_basket") return "공공 쓰레기통";
  if (tags.operator) return `${tags.operator} 분리수거함`;
  if (tags.amenity === "waste_disposal") return "생활폐기물 수거 지점";
  return "분리수거함";
}

function overpassToPlaces(elements: OverpassElement[], location: UserLocation) {
  return elements.flatMap((element, index): Place[] => {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") return [];
    const tags = element.tags ?? {};
    const materials = materialsFromTags(tags);
    const rawPlace: Place = {
      id: `${element.type}-${element.id}`,
      name: placeName(tags, materials),
      type: materials.length ? materials.join(" · ") : "수거 품목 정보 없음",
      distance: "",
      walk: "",
      status: tags.opening_hours ? `운영 ${tags.opening_hours}` : tags.amenity === "waste_basket" ? "공공 쓰레기통" : "OpenStreetMap 등록 지점",
      tone: (["green", "black", "blue"] as const)[index % 3],
      lat,
      lng,
      materials,
      source: "osm",
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    };
    const meters = distanceInMeters(location, rawPlace);
    return [{ ...rawPlace, distance: formatDistance(meters), walk: `도보 약 ${Math.max(1, Math.round(meters / 80))}분` }];
  }).sort((a, b) => distanceInMeters(location, a) - distanceInMeters(location, b));
}

async function fetchCollectionPlaces(location: UserLocation, signal: AbortSignal) {
  const response = await fetch(`/api/collection-points?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Collection API returned ${response.status}`);
  const data = await response.json() as { elements?: OverpassElement[]; meta?: CollectionMeta };
  if (!Array.isArray(data.elements) || !data.meta) throw new Error("Invalid collection API response");
  return { places: overpassToPlaces(data.elements, location).slice(0, 100), meta: data.meta };
}

const spring = {
  type: "spring" as const,
  stiffness: 340,
  damping: 37,
  mass: 1,
};

const flickSpring = {
  type: "spring" as const,
  stiffness: 340,
  damping: 30,
  mass: 1,
};

function IconButton({
  label,
  children,
  onClick,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      transition={spring}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="버림 홈">
      <div className="brand-mark" aria-hidden="true">
        <Recycle size={19} strokeWidth={2.5} />
      </div>
      <span>버림</span>
      <i />
    </div>
  );
}

function Header({
  onNotification,
  onBack,
  locationStatus,
  onLocationRequest,
  notificationActive,
}: {
  onNotification: () => void;
  onBack: () => void;
  locationStatus: LocationStatus;
  onLocationRequest: () => void;
  notificationActive: boolean;
}) {
  const locationLabel = {
    idle: "위치 켜기",
    loading: "확인 중",
    granted: "현재 위치",
    denied: "권한 필요",
    unavailable: "위치 오류",
  }[locationStatus];

  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        <button className="back-to-landing" type="button" onClick={onBack}>
          <ArrowLeft size={14} /> 소개
        </button>
        <button className={`location-pill ${locationStatus}`} type="button" onClick={onLocationRequest} disabled={locationStatus === "loading"}>
          <MapPin size={14} strokeWidth={2.4} />
          {locationLabel}
          <ChevronRight size={14} />
        </button>
        <IconButton label="알림 보기" onClick={onNotification}>
          <Bell size={20} />
          {notificationActive && <span className="notification-dot" />}
        </IconButton>
      </div>
    </header>
  );
}

function MiniMap({
  onPlace,
  onExpand,
  userLocation,
  places,
  collectionStatus,
}: {
  onPlace: (place: Place) => void;
  onExpand?: () => void;
  userLocation: UserLocation | null;
  places: Place[];
  collectionStatus: CollectionStatus;
}) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const userMarker = useRef<CircleMarker | null>(null);
  const accuracyCircle = useRef<Circle | null>(null);
  const placeLayer = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const onPlaceRef = useRef(onPlace);
  const [mapReady, setMapReady] = useState(false);
  const compactMap = Boolean(onExpand);

  useEffect(() => {
    onPlaceRef.current = onPlace;
  }, [onPlace]);

  useEffect(() => {
    let active = true;

    async function initializeMap() {
      if (!mapNode.current || mapInstance.current) return;
      const L = await import("leaflet");
      if (!active || !mapNode.current) return;
      leaflet.current = L;

      const map = L.map(mapNode.current, {
        zoomControl: !compactMap,
        attributionControl: true,
        scrollWheelZoom: !compactMap,
      }).setView(fallbackCenter, compactMap ? 15 : 16);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      placeLayer.current = L.layerGroup().addTo(map);
      mapInstance.current = map;
      window.setTimeout(() => map.invalidateSize(), 0);
      setMapReady(true);
    }

    void initializeMap();
    return () => {
      active = false;
      mapInstance.current?.remove();
      mapInstance.current = null;
      placeLayer.current = null;
      leaflet.current = null;
    };
  }, [compactMap]);

  useEffect(() => {
    const L = leaflet.current;
    const layer = placeLayer.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();

    places.forEach((place) => {
      const color = place.tone === "green" ? "#76a92b" : place.tone === "blue" ? "#4d8bc5" : "#242924";
      const marker = L.circleMarker([place.lat, place.lng], {
        radius: 10,
        color: "#ffffff",
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(layer);
      marker.bindTooltip(place.name, { direction: "top", offset: [0, -9] });
      marker.on("click", () => onPlaceRef.current(place));
    });
  }, [mapReady, places]);

  useEffect(() => {
    const L = leaflet.current;
    const map = mapInstance.current;
    if (!L || !map || !mapReady) return;

    userMarker.current?.remove();
    accuracyCircle.current?.remove();
    userMarker.current = null;
    accuracyCircle.current = null;

    if (!userLocation) return;
    const point: [number, number] = [userLocation.lat, userLocation.lng];
    accuracyCircle.current = L.circle(point, {
      radius: Math.max(userLocation.accuracy, 20),
      color: "#1778f2",
      weight: 1,
      fillColor: "#4098ff",
      fillOpacity: 0.12,
    }).addTo(map);
    userMarker.current = L.circleMarker(point, {
      radius: 8,
      color: "#ffffff",
      weight: 3,
      fillColor: "#1778f2",
      fillOpacity: 1,
    }).addTo(map).bindTooltip("내 위치", { permanent: true, direction: "top", offset: [0, -8] });
    map.flyTo(point, 16, { duration: 0.7 });
  }, [mapReady, userLocation]);

  return (
    <div className="map-canvas" aria-label="OpenStreetMap 기반 주변 분리배출 장소 지도">
      <div ref={mapNode} className="leaflet-map" />
      <span className={`map-data-badge ${collectionStatus}`}>
        {collectionStatus === "demo" && "위치 권한 전 데모 데이터"}
        {collectionStatus === "loading" && <><span className="data-spinner" /> 실제 수거 지점 불러오는 중</>}
        {collectionStatus === "success" && <><i /> OpenStreetMap 실제 수거 지점</>}
        {collectionStatus === "empty" && "반경 15km에 등록된 지점 없음"}
        {collectionStatus === "error" && "수거 지점 연결 실패"}
      </span>
      {onExpand && (
        <motion.button
          className="expand-map"
          type="button"
          whileTap={{ scale: 0.93 }}
          transition={spring}
          onClick={onExpand}
        >
          <Map size={15} /> 크게 보기
        </motion.button>
      )}
    </div>
  );
}

function HomeView({
  onScan,
  onMap,
  onPlace,
  userLocation,
  collectionPlaces,
  collectionStatus,
  monthCount,
  onGuide,
}: {
  onScan: () => void;
  onMap: () => void;
  onPlace: (place: Place) => void;
  userLocation: UserLocation | null;
  collectionPlaces: Place[];
  collectionStatus: CollectionStatus;
  monthCount: number;
  onGuide: (analysis: WasteAnalysis) => void;
}) {
  const nearbyPlaces = userLocation
    ? [...collectionPlaces].sort((a, b) => distanceInMeters(userLocation, a) - distanceInMeters(userLocation, b))
    : collectionPlaces;
  const nearestPlace = nearbyPlaces[0] ?? null;
  const nearestDistance = nearestPlace && userLocation ? formatDistance(distanceInMeters(userLocation, nearestPlace)) : nearestPlace?.distance;

  return (
    <motion.main
      className="view home-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={spring}
    >
      <section className="greeting">
        <div>
          <span className="eyebrow">7월 18일 · 금요일</span>
          <h1>오늘도 잘 버려볼까요?</h1>
        </div>
        <div className="impact-badge" aria-label={`이번 달 ${monthCount}개 올바르게 분리배출`}>
          <Recycle size={16} />
          <strong>{monthCount}</strong>
        </div>
      </section>

      <section className="decision-flow" aria-label="버림이 해결하는 세 가지 망설임">
        <div>
          <span className="eyebrow">문제에서 출발한 UX</span>
          <strong>버리기 직전, 세 번의 망설임을 한 번에 줄여요.</strong>
        </div>
        <ol>
          <li><i>1</i><span><small>품목 판단</small>이게 무엇인지</span></li>
          <li><i>2</i><span><small>행동 안내</small>어떻게 손질할지</span></li>
          <li><i>3</i><span><small>장소 연결</small>어디에 버릴지</span></li>
        </ol>
      </section>

      <motion.button
        className="scan-hero"
        type="button"
        whileTap={{ scale: 0.985 }}
        transition={spring}
        onClick={onScan}
      >
        <div className="scan-copy">
          <span className="scan-kicker"><Sparkles size={14} /> AI 분리배출</span>
          <h2>이거, 어떻게<br />버려야 하지?</h2>
          <p>사진 한 장이면 바로 알려드려요</p>
          <span className="scan-cta">사진으로 확인하기 <ArrowRight size={17} /></span>
        </div>
        <div className="scan-visual" aria-hidden="true">
          <div className="scan-orbit orbit-one" />
          <div className="scan-orbit orbit-two" />
          <motion.div
            className="scan-object"
            animate={{ y: [0, -5, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Bottle size={60} strokeWidth={1.45} />
          </motion.div>
          <ScanLine className="scan-line-icon" size={94} strokeWidth={0.8} />
        </div>
      </motion.button>

      <section className="section-block nearby-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">내 주변</span>
            <h2>가까운 분리배출 장소</h2>
          </div>
          <button type="button" onClick={onMap}>전체 지도 <ChevronRight size={16} /></button>
        </div>
        <div className="map-card">
          <MiniMap onPlace={onPlace} onExpand={onMap} userLocation={userLocation} places={collectionPlaces} collectionStatus={collectionStatus} />
          {nearestPlace ? (
            <button className="nearest-place" type="button" onClick={() => onPlace(nearestPlace)}>
              <div className="place-icon"><Recycle size={20} /></div>
              <div className="place-copy">
                <strong>{nearestPlace.name}</strong>
                <span>{nearestPlace.type}</span>
              </div>
              <div className="place-distance">
                <strong>{nearestDistance}</strong>
                <span>{userLocation ? "직선거리" : nearestPlace.walk}</span>
              </div>
            </button>
          ) : (
            <div className="place-empty"><MapPin size={19} /><span><strong>{collectionStatus === "loading" ? "주변 수거 지점을 찾고 있어요" : "등록된 수거 지점이 없어요"}</strong><small>{collectionStatus === "error" ? "잠시 후 위치 버튼을 다시 눌러주세요." : "지도에서 검색 범위를 확인해 주세요."}</small></span></div>
          )}
        </div>
      </section>

      <section className="section-block guide-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">오늘의 분리배출</span>
            <h2>헷갈리기 쉬운 품목</h2>
          </div>
        </div>
        <div className="guide-grid">
          <motion.button type="button" whileTap={{ scale: 0.97 }} transition={spring} onClick={() => onGuide(guideAnalyses.glass)}>
            <span className="guide-icon yellow"><GlassWater size={23} /></span>
            <span><strong>깨진 유리</strong><small>신문지에 감싸 일반쓰레기</small></span>
            <ChevronRight size={17} />
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.97 }} transition={spring} onClick={() => onGuide(guideAnalyses.receipt)}>
            <span className="guide-icon lilac"><PackageOpen size={23} /></span>
            <span><strong>영수증</strong><small>코팅된 감열지는 일반쓰레기</small></span>
            <ChevronRight size={17} />
          </motion.button>
        </div>
      </section>
    </motion.main>
  );
}

function MapView({
  onPlace,
  userLocation,
  locationStatus,
  onLocationRequest,
  collectionPlaces,
  collectionStatus,
  collectionMeta,
  onRefreshCollections,
}: {
  onPlace: (place: Place) => void;
  userLocation: UserLocation | null;
  locationStatus: LocationStatus;
  onLocationRequest: () => void;
  collectionPlaces: Place[];
  collectionStatus: CollectionStatus;
  collectionMeta: CollectionMeta | null;
  onRefreshCollections: () => void;
}) {
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const nearbyPlaces = userLocation
    ? [...collectionPlaces].sort((a, b) => distanceInMeters(userLocation, a) - distanceInMeters(userLocation, b))
    : collectionPlaces;
  const filterTerms: Record<string, string[]> = {
    전체: [],
    페트병: ["페트병", "플라스틱"],
    폐건전지: ["폐건전지"],
    소형가전: ["소형가전", "전자제품"],
    의류: ["의류", "신발"],
    일반: ["일반쓰레기", "생활폐기물"],
  };
  const materialFilteredPlaces = filter === "전체"
    ? nearbyPlaces
    : nearbyPlaces.filter((place) => filterTerms[filter].some((term) => place.materials.includes(term)));
  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  const filteredPlaces = normalizedSearch
    ? materialFilteredPlaces.filter((place) => `${place.name} ${place.type}`.toLocaleLowerCase("ko-KR").includes(normalizedSearch))
    : materialFilteredPlaces;
  const locationNotice = {
    idle: "",
    loading: "현재 위치를 확인하고 있어요",
    granted: userLocation ? `내 위치 표시 완료 · 오차 약 ${Math.round(userLocation.accuracy)}m` : "내 위치를 표시했어요",
    denied: "위치 권한이 거부됐어요 · 브라우저 설정에서 허용해주세요",
    unavailable: "현재 위치를 확인할 수 없어요 · 잠시 후 다시 시도해주세요",
  }[locationStatus];

  return (
    <motion.main
      className="view map-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="map-page-head">
        <span className="eyebrow">분리배출 지도</span>
        <h1>버릴 곳을 찾아드릴게요</h1>
        <label className="search-bar">
          <Search size={19} />
          <input aria-label="장소 검색" placeholder="장소명이나 수거 품목으로 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="filter-row" role="group" aria-label="수거 품목 필터">
          {["전체", "페트병", "폐건전지", "소형가전", "의류", "일반"].map((item) => (
            <button
              className={filter === item ? "active" : ""}
              type="button"
              key={item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className={`data-health ${collectionStatus}`}>
          <span>{collectionStatus === "loading" ? <span className="data-spinner" /> : <i />}</span>
          <div>
            <strong>{collectionStatus === "success" ? `실제 수거 지점 ${collectionPlaces.length}곳 연결` : collectionStatus === "loading" ? "공개 데이터를 확인하고 있어요" : collectionStatus === "error" ? "데이터 연결이 지연되고 있어요" : collectionStatus === "empty" ? "등록된 지점을 찾지 못했어요" : "위치 권한을 허용해 주세요"}</strong>
            <small>{collectionMeta ? `반경 ${collectionMeta.radiusKm}km · 서버 ${collectionMeta.fallbackServers}곳 자동 재시도 · ${new Date(collectionMeta.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 갱신` : "분리수거함·쓰레기통·무인회수기를 함께 조회합니다."}</small>
          </div>
          <motion.button type="button" whileTap={{ scale: 0.92 }} transition={spring} onClick={onRefreshCollections}>새로고침</motion.button>
        </div>
      </div>
      <div className="full-map-wrap">
        <MiniMap onPlace={onPlace} userLocation={userLocation} places={filteredPlaces} collectionStatus={collectionStatus} />
        <motion.button
          className={`locate-button ${locationStatus}`}
          type="button"
          aria-label={locationStatus === "granted" ? "현재 위치 다시 확인" : "위치 권한을 요청하고 현재 위치 표시"}
          whileTap={{ scale: 0.88 }}
          transition={spring}
          disabled={locationStatus === "loading"}
          onClick={onLocationRequest}
        >
          <LocateFixed size={20} />
        </motion.button>
        <AnimatePresence>
          {locationNotice && (
            <motion.div
              className={`map-toast ${locationStatus}`}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={spring}
            >
              {locationStatus === "granted" ? <Check size={15} /> : locationStatus === "loading" ? <span className="location-spinner" /> : <TriangleAlert size={15} />}
              {locationNotice}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="place-list">
        <div className="list-title"><strong>가까운 순</strong><span>{filteredPlaces.length}곳 · {collectionStatus === "success" ? "OpenStreetMap 실시간 연동" : collectionStatus === "demo" ? "위치 권한 전 데모" : "데이터 확인 중"}</span></div>
        {filteredPlaces.map((place) => (
          <motion.button
            className="place-row"
            type="button"
            key={place.id}
            whileTap={{ scale: 0.985 }}
            transition={spring}
            onClick={() => onPlace(place)}
          >
            <div className={`place-icon ${place.tone}`}>
              {place.materials.includes("소형가전") || place.materials.includes("전자제품") ? <Zap size={20} /> : <Recycle size={20} />}
            </div>
            <div className="place-copy">
              <strong>{place.name}</strong>
              <span>{place.type}</span>
              <small><i /> {place.status}</small>
            </div>
            <div className="place-distance">
              <strong>{userLocation ? formatDistance(distanceInMeters(userLocation, place)) : place.distance}</strong>
              <span>{userLocation ? "직선거리" : place.walk}</span>
            </div>
          </motion.button>
        ))}
        {filteredPlaces.length === 0 && (
          <div className="map-empty-state">
            {collectionStatus === "loading" ? <span className="empty-spinner" /> : <MapPin size={22} />}
            <strong>{collectionStatus === "loading" ? "실제 수거 지점을 불러오는 중이에요" : search ? "검색 결과가 없어요" : filter === "전체" ? "주변에 등록된 수거 지점이 없어요" : `${filter} 수거 지점이 없어요`}</strong>
            <p>{collectionStatus === "error" ? "외부 지도 데이터 연결이 지연되고 있어요. 위치 버튼을 눌러 다시 시도해 주세요." : "OpenStreetMap에 등록된 공개 지점을 기준으로 보여드려요."}</p>
            {(collectionStatus === "error" || collectionStatus === "empty") && <button type="button" onClick={onRefreshCollections}>다시 불러오기</button>}
          </div>
        )}
      </div>
    </motion.main>
  );
}

function iconForRecord(record: WasteRecord) {
  const text = `${record.itemName} ${record.material} ${record.category}`;
  if (/유리/.test(text)) return { Icon: GlassWater, tone: "yellow" };
  if (/비닐|코팅|봉투|포장|종이/.test(text)) return { Icon: PackageOpen, tone: "lilac" };
  return { Icon: Bottle, tone: "mint" };
}

function HistoryView({ onScan, records, monthlyStats }: { onScan: () => void; records: WasteRecord[]; monthlyStats: MonthlyStats }) {
  const recentRecords = records.slice(0, 5);
  const diffLabel = monthlyStats.diff > 0 ? `+${monthlyStats.diff}` : monthlyStats.diff < 0 ? `${monthlyStats.diff}` : "±0";

  return (
    <motion.main
      className="view history-view"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={spring}
    >
      <div className="page-heading">
        <span className="eyebrow">나의 기록</span>
        <h1>잘 버린 순간들</h1>
        <p>이번 달 활동의 참고용 탄소 절감 추정치는 {monthlyStats.estimatedCarbonKg.toFixed(1)}kg CO₂e예요.</p>
      </div>
      <div className="impact-card">
        <div>
          <span>{new Date().getMonth() + 1}월의 올바른 분리배출</span>
          <strong>{monthlyStats.thisMonthCount}<small>개</small></strong>
        </div>
        <div className="impact-ring"><span>{diffLabel}</span><small>지난달보다</small></div>
      </div>
      <div className="record-heading"><strong>최근 분석</strong></div>
      {recentRecords.length ? <div className="record-list">
        {recentRecords.map((record) => {
          const { Icon, tone } = iconForRecord(record);
          return <div className="record-item" key={record.id}>
            <span className={`record-icon ${tone}`}><Icon size={23} /></span>
            <span className="record-copy"><strong>{record.itemName}</strong><small>{record.material} · {record.category}</small><em>{formatRecordTime(record.timestamp)}</em></span>
          </div>;
        })}
      </div> : <div className="record-empty"><Recycle size={22} /><p>아직 분석 기록이 없어요.<br />첫 물건을 스캔하고 기록을 시작해보세요.</p></div>}
      <button className="history-scan" type="button" onClick={onScan}>
        <Camera size={20} /> 새로운 물건 확인하기
      </button>
    </motion.main>
  );
}

function authDisplayName(user: User) {
  const metadataName = user.user_metadata?.display_name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] || "버림 사용자";
}

function authErrorMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (/email not confirmed/i.test(message)) return "이메일 인증을 먼저 완료해 주세요.";
  if (/user already registered/i.test(message)) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (/password.*at least|weak password/i.test(message)) return "비밀번호는 8자 이상으로 입력해 주세요.";
  if (/rate limit/i.test(message)) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  return "인증 중 문제가 생겼어요. 입력 내용을 확인하고 다시 시도해 주세요.";
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!isSupabaseConfigured) {
      setError("로그인 연결을 위해 Supabase 환경 변수를 먼저 등록해 주세요.");
      return;
    }
    if (mode === "signup" && !displayName.trim()) {
      setError("화면에 표시할 이름을 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 입력해 주세요.");
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        onClose();
      } else {
        const { data, error: signUpError } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) onClose();
        else setMessage("인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 완료돼요.");
      }
    } catch (caught) {
      setError(authErrorMessage(caught instanceof Error ? caught.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError("");
    if (!isSupabaseConfigured) {
      setError("로그인 연결을 위해 Supabase 환경 변수를 먼저 등록해 주세요.");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) {
      setError(authErrorMessage(oauthError.message));
      setBusy(false);
    }
  }

  return (
    <>
      <motion.button
        className="auth-backdrop"
        type="button"
        aria-label="로그인 창 닫기"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.2 }}
        onClick={() => !busy && onClose()}
      />
      <motion.section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 22, backdropFilter: "blur(4px)" }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, backdropFilter: "blur(28px)" }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 14 }}
        transition={reduceMotion ? { duration: 0.15 } : spring}
      >
        <div className="auth-dialog-head">
          <div className="auth-mark"><Recycle size={21} /></div>
          <button type="button" aria-label="로그인 창 닫기" onClick={onClose} disabled={busy}><X size={19} /></button>
        </div>
        <div className="auth-copy">
          <span>BEORIM ACCOUNT</span>
          <h2 id="auth-title">분리배출 기록을<br />어디서든 이어가세요.</h2>
          <p>최소한의 정보만 사용하며, 사진은 계정에 저장하지 않아요.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="인증 방식">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}>회원가입</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.label className="auth-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 58 }} exit={{ opacity: 0, height: 0 }} transition={reduceMotion ? { duration: 0.15 } : spring}>
                <UserRound size={17} />
                <span>이름</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="표시할 이름" disabled={busy} />
              </motion.label>
            )}
          </AnimatePresence>
          <label className="auth-field">
            <Mail size={17} />
            <span>이메일</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="name@example.com" required disabled={busy} />
          </label>
          <label className="auth-field">
            <LockKeyhole size={17} />
            <span>비밀번호</span>
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" minLength={8} required disabled={busy} />
            <button type="button" className="password-toggle" aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </label>

          <div className={`auth-feedback ${error ? "error" : message ? "success" : ""}`} aria-live="polite">
            {error || message || (mode === "signup" ? "가입 후 이메일 인증이 필요할 수 있어요." : "이메일과 비밀번호로 안전하게 로그인해요.")}
          </div>

          <motion.button className="auth-submit" type="submit" whileTap={{ scale: 0.975 }} transition={spring} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
            {busy ? "확인하고 있어요" : mode === "login" ? "로그인" : "계정 만들기"}
          </motion.button>
        </form>

        <div className="auth-divider"><span>또는</span></div>
        <motion.button className="google-auth" type="button" whileTap={{ scale: 0.975 }} transition={spring} onClick={() => void signInWithGoogle()} disabled={busy}>
          <strong>G</strong> Google로 계속하기
        </motion.button>
        <button className="guest-auth" type="button" onClick={onClose} disabled={busy}>로그인 없이 둘러보기 <ArrowRight size={15} /></button>

        <aside className="auth-trust" aria-label="로그인 안심 안내">
          <div className="auth-trust-head">
            <span><ShieldCheck size={16} /></span>
            <div><strong>안심하고 로그인하세요</strong><small>필요한 정보만 안전하게 처리해요</small></div>
          </div>
          <ul>
            <li>
              <LockKeyhole size={14} />
              <p><strong>비밀번호는 버림 서버에 저장하지 않아요</strong><small>검증된 Supabase 인증 시스템이 직접 처리합니다.</small></p>
            </li>
            <li>
              <ShieldCheck size={14} />
              <p><strong>브라우저에는 공개용 키만 사용해요</strong><small>관리자 권한 키와 Gemini API 키는 화면에 노출하지 않습니다.</small></p>
            </li>
            <li>
              <EyeOff size={14} />
              <p><strong>사진은 계정에 남지 않아요</strong><small>분석을 위해서만 전송되며, 버림은 사진을 서버에 보관하거나 활동 기록과 연결하지 않습니다.</small></p>
            </li>
          </ul>
        </aside>

        {!isSupabaseConfigured && (
          <p className="auth-setup-note"><TriangleAlert size={14} /> 현재는 게스트 모드예요. Supabase 환경 변수를 등록하면 로그인이 활성화됩니다.</p>
        )}
      </motion.section>
    </>
  );
}

function ProfileView({ user, loading, onLogin, onSignOut, onNeighborhood, onNotificationSettings, onFavorites, onHelp, notificationsEnabled }: {
  user: User | null; loading: boolean; onLogin: () => void; onSignOut: () => void;
  onNeighborhood: () => void; onNotificationSettings: () => void; onFavorites: () => void; onHelp: () => void; notificationsEnabled: boolean;
}) {
  const displayName = user ? authDisplayName(user) : "";
  const settings = [
    { id: "neighborhood", label: "내 동네 설정", detail: "현재 위치를 다시 확인해요", icon: <MapPin size={19} />, onClick: onNeighborhood },
    { id: "notification", label: "분리배출 알림", detail: notificationsEnabled ? "켜짐 · 상단 알림과 연동" : "꺼짐 · 눌러서 다시 켜기", icon: <Bell size={19} />, onClick: onNotificationSettings },
    { id: "favorites", label: "즐겨찾는 수거함", detail: "가장 가까운 수거함을 열어요", icon: <Recycle size={19} />, onClick: onFavorites },
    { id: "help", label: "도움말 및 제보", detail: "문의 메일을 작성해요", icon: <CircleHelp size={19} />, onClick: onHelp },
  ];
  return (
    <motion.main
      className="view profile-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className={`profile-card ${user ? "signed-in" : "guest"}`}>
        {loading ? (
          <div className="profile-loading" role="status"><LoaderCircle className="spin" size={24} /> 계정을 확인하고 있어요</div>
        ) : user ? (
          <>
            <div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div>
            <span>환경 새싹 · 레벨 3</span>
            <h1>{displayName}님</h1>
            <p>{user.email}</p>
            <div className="account-status"><Check size={14} /> 로그인됨 · 기록 동기화 준비 완료</div>
            <button className="profile-signout" type="button" onClick={onSignOut}><LogOut size={16} /> 로그아웃</button>
          </>
        ) : (
          <>
            <div className="avatar guest-avatar"><UserRound size={27} /></div>
            <span>게스트 모드</span>
            <h1>기록을 이어서 관리하세요</h1>
            <p>로그인하면 기기를 바꿔도 활동 기록과 즐겨찾기를 이어갈 수 있어요.</p>
            <motion.button className="profile-login" type="button" whileTap={{ scale: 0.975 }} transition={spring} onClick={onLogin}><LogIn size={17} /> 로그인 또는 회원가입</motion.button>
            <small className="guest-note"><ShieldCheck size={13} /> 촬영한 사진은 분석에만, 로그인 정보는 인증에만 사용되며 버림 서버에 저장되지 않아요. 로그인 없이도 핵심 기능을 쓸 수 있어요.</small>
          </>
        )}
      </div>
      <section className="ai-principles">
        <div className="principle-head">
          <span><ShieldCheck size={18} /></span>
          <div><small>RESPONSIBLE AI</small><strong>버림의 AI 사용 원칙</strong></div>
        </div>
        <div className="principle-grid">
          <div><i>01</i><span><strong>모르면 멈추기</strong><small>낮은 확신도에서는 판정을 보류해요.</small></span></div>
          <div><i>02</i><span><strong>근거를 보여주기</strong><small>관찰 단서와 공식 출처를 함께 밝혀요.</small></span></div>
          <div><i>03</i><span><strong>사진을 남기지 않기</strong><small>분석 요청 후 사진을 보관하지 않아요.</small></span></div>
        </div>
      </section>
      <div className="settings-list">
        {settings.map((item) => (
          <button type="button" key={item.id} onClick={item.onClick}>
            <span>{item.icon}</span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
    </motion.main>
  );
}

function BottomNav({ tab, onChange, onScan }: { tab: Tab; onChange: (tab: Tab) => void; onScan: () => void }) {
  const items = [
    { id: "home" as Tab, label: "홈", icon: Home },
    { id: "map" as Tab, label: "지도", icon: Map },
    { id: "ai" as Tab, label: "버림 AI", icon: Sparkles },
    { id: "history" as Tab, label: "기록", icon: History },
    { id: "profile" as Tab, label: "내 정보", icon: UserRound },
  ];

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {items.slice(0, 2).map((item) => (
        <button type="button" className={tab === item.id ? "active" : ""} key={item.id} onClick={() => onChange(item.id)}>
          <item.icon size={21} /> <span>{item.label}</span>
        </button>
      ))}
      <motion.button
        className="camera-nav"
        type="button"
        aria-label="사진으로 분리배출 확인"
        whileTap={{ scale: 0.9 }}
        transition={spring}
        onClick={onScan}
      >
        <Camera size={25} />
      </motion.button>
      {items.slice(2).map((item) => (
        <button type="button" className={tab === item.id ? "active" : ""} key={item.id} onClick={() => onChange(item.id)}>
          <item.icon size={21} /> <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function UnifiedAiView({
  analysis,
  userLocation,
  places,
  onScan,
  onMap,
}: {
  analysis: WasteAnalysis | null;
  userLocation: UserLocation | null;
  places: Place[];
  onScan: () => void;
  onMap: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<WasteChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const nearestPlaces = userLocation
    ? [...places].sort((a, b) => distanceInMeters(userLocation, a) - distanceInMeters(userLocation, b)).slice(0, 3)
    : places.slice(0, 3);
  const suggestions = analysis
    ? ["지금부터 무엇을 하면 돼?", "어디에 버리는 게 가장 가까워?", "판정이 확실한지 다시 설명해줘"]
    : ["이 물건은 어떻게 확인하면 돼?", "내 주변 수거함을 찾아줘", "분리배출이 헷갈릴 때 원칙을 알려줘"];

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  async function ask(event?: FormEvent, suggestion?: string) {
    event?.preventDefault();
    const nextQuestion = (suggestion ?? question).trim();
    if (!nextQuestion || loading) return;
    const history = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: nextQuestion }]);
    setQuestion("");
    setChatError("");
    setLoading(true);
    try {
      const response = await fetch("/api/waste-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "integrated",
          analysis,
          location: userLocation,
          places: nearestPlaces,
          messages: history,
          question: nextQuestion,
        }),
      });
      const data = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "답변을 만들지 못했습니다.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer! }]);
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "통합 안내를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.main className="view unified-ai-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
      <section className="unified-ai-hero">
        <div className="unified-ai-orb"><Sparkles size={25} /></div>
        <div><span>BEORIM INTELLIGENCE</span><h1>버리는 과정 전체를<br />한 번에 물어보세요.</h1><p>사진 판정과 행동 요령, 현재 위치, 주변 수거함을 연결해 지금 해야 할 다음 행동을 알려드려요.</p></div>
      </section>

      <div className="ai-context-grid" aria-label="버림 AI가 연결한 정보">
        <button type="button" onClick={onScan}>
          <span className={analysis ? "ready" : "waiting"}>{analysis ? <Check size={16} /> : <Camera size={16} />}</span>
          <div><small>사진 인식</small><strong>{analysis ? analysis.itemName : "아직 확인한 물건이 없어요"}</strong><em>{analysis ? `확신도 ${analysis.confidence}% · ${analysis.category}` : "사진을 찍으면 대화에 자동으로 연결돼요"}</em></div>
          <ChevronRight size={17} />
        </button>
        <button type="button" onClick={onMap}>
          <span className={userLocation ? "ready" : "waiting"}>{userLocation ? <LocateFixed size={16} /> : <MapPin size={16} />}</span>
          <div><small>위치와 수거함</small><strong>{userLocation ? `${places.length}곳의 수거 지점 연결` : "현재 위치 확인이 필요해요"}</strong><em>{nearestPlaces[0] ? `가장 가까운 곳 · ${nearestPlaces[0].name}` : "지도를 열어 주변 장소를 찾아보세요"}</em></div>
          <ChevronRight size={17} />
        </button>
      </div>

      <section className="unified-chat">
        <header><span><MessageCircle size={17} /></span><div><strong>버림 AI</strong><small>상황을 연결해 다음 행동을 안내해요</small></div><i>GEMINI</i></header>
        <div className="unified-thread" role="log" aria-live="polite">
          {messages.length === 0 && (
            <div className="ai-welcome"><Sparkles size={18} /><p><strong>{analysis ? `${analysis.itemName} 결과를 기억하고 있어요.` : "무엇을 버리려는지 알려주세요."}</strong><span>{analysis ? "가까운 배출 장소까지 이어서 물어볼 수 있어요." : "사진을 먼저 찍어도 되고, 궁금한 점부터 물어봐도 돼요."}</span></p></div>
          )}
          {messages.map((message, index) => <div className={`unified-bubble ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? "버림 AI" : "나"}</span><p>{message.content}</p></div>)}
          {loading && <div className="unified-bubble assistant loading"><span>버림 AI</span><p><i /><i /><i /></p></div>}
          <div ref={chatEnd} />
        </div>
        {messages.length === 0 && <div className="unified-suggestions">{suggestions.map((item) => <motion.button type="button" key={item} whileTap={{ scale: .97 }} transition={spring} onClick={() => void ask(undefined, item)}>{item}</motion.button>)}</div>}
        {chatError && <div className="chat-error" role="alert"><TriangleAlert size={14} />{chatError}</div>}
        <form className="unified-composer" onSubmit={(event) => void ask(event)}>
          <label><span className="visually-hidden">버림 AI에게 질문</span><input value={question} maxLength={400} placeholder="예: 이 페트병을 지금 어디에 버리면 돼?" onChange={(event) => setQuestion(event.target.value)} /></label>
          <motion.button type="submit" aria-label="질문 보내기" disabled={!question.trim() || loading} whileTap={{ scale: .9 }} transition={spring}>{loading ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</motion.button>
        </form>
        <p className="unified-ai-safety"><ShieldCheck size={13} /> 모르면 추측하지 않고 추가 확인을 요청하며, 대화는 서버에 저장하지 않아요.</p>
      </section>
    </motion.main>
  );
}

function PlaceSheet({ place, onClose }: { place: Place; onClose: () => void }) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();

  function handleDragEnd(_: unknown, info: { offset: { y: number }; velocity: { y: number } }) {
    const endpoint = info.offset.y + (info.velocity.y / 1000) * (0.998 / (1 - 0.998));
    if (endpoint > 190 || info.offset.y > 110) onClose();
  }

  return (
    <>
      <motion.button
        className="sheet-backdrop"
        type="button"
        aria-label="장소 상세 닫기"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.2 }}
        onClick={onClose}
      />
      <motion.aside
        className="place-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${place.name} 상세 정보`}
        initial={reduceMotion ? { opacity: 0 } : { y: "100%", scale: 0.98, filter: "blur(10px)" }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0, scale: 1, filter: "blur(0px)" }}
        exit={reduceMotion ? { opacity: 0 } : { y: "100%", scale: 0.98, filter: "blur(8px)" }}
        transition={reduceMotion ? { duration: 0.15 } : flickSpring}
        drag={reduceMotion ? false : "y"}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 420 }}
        dragElastic={{ top: 0.02, bottom: 0.55 }}
        onDragEnd={handleDragEnd}
      >
        <button
          className="sheet-handle-wrap"
          type="button"
          aria-label="아래로 밀어 닫기"
          onPointerDown={(event: ReactPointerEvent) => controls.start(event)}
        >
          <span className="sheet-handle" />
        </button>
        <div className="sheet-status"><span><i /> {place.status}</span><em>{place.distance} · {place.walk}</em></div>
        <h2>{place.name}</h2>
        <p>{place.type}</p>
        <div className="sheet-info-grid">
          <div><Map size={18} /><span>데이터 출처<strong>{place.source === "osm" ? "OpenStreetMap" : "MVP 데모"}</strong></span></div>
          <div><Navigation size={18} /><span>현재 위치에서<strong>{place.walk}</strong></span></div>
        </div>
        <div className="accepted-items">
          <span>배출 가능 품목</span>
          <div>{(place.materials.length ? place.materials : ["현장 확인 필요"]).map((material) => <i key={material}>{material}</i>)}</div>
        </div>
        {place.sourceUrl && <a className="osm-source-link" href={place.sourceUrl} target="_blank" rel="noreferrer">OpenStreetMap 원본 정보 확인 <ExternalLink size={13} /></a>}
        <motion.a className="primary-button" href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`} target="_blank" rel="noreferrer" whileTap={{ scale: 0.98 }} transition={spring}>
          <Navigation size={19} /> 길찾기 시작
        </motion.a>
      </motion.aside>
    </>
  );
}

function GuideSheet({ analysis, onClose }: { analysis: WasteAnalysis; onClose: () => void }) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  function handleDragEnd(_: unknown, info: { offset: { y: number }; velocity: { y: number } }) {
    const endpoint = info.offset.y + (info.velocity.y / 1000) * (0.998 / (1 - 0.998));
    if (endpoint > 190 || info.offset.y > 110) onClose();
  }
  return <>
    <motion.button className="sheet-backdrop" type="button" aria-label="품목 상세 닫기" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? .15 : .2 }} onClick={onClose} />
    <motion.aside className="place-sheet guide-sheet" role="dialog" aria-modal="true" aria-label={`${analysis.itemName} 상세 설명`}
      initial={reduceMotion ? { opacity: 0 } : { y: "100%", scale: .98, filter: "blur(10px)" }} animate={reduceMotion ? { opacity: 1 } : { y: 0, scale: 1, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { y: "100%", scale: .98, filter: "blur(8px)" }} transition={reduceMotion ? { duration: .15 } : flickSpring}
      drag={reduceMotion ? false : "y"} dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 420 }} dragElastic={{ top: .02, bottom: .55 }} onDragEnd={handleDragEnd}>
      <button className="sheet-handle-wrap" type="button" aria-label="아래로 밀어 닫기" onPointerDown={(event: ReactPointerEvent) => controls.start(event)}><span className="sheet-handle" /></button>
      <div className="sheet-status"><span><i /> 헷갈리기 쉬운 품목</span><em>{analysis.material}</em></div>
      <h2>{analysis.itemName}</h2><p>{analysis.category}</p>
      <div className="result-summary"><Sparkles size={17} /><p><strong>한 줄 요약</strong>{analysis.summary}</p></div>
      <div className={`evidence-card ${evidenceOpen ? "open" : ""}`}>
        <motion.button type="button" aria-expanded={evidenceOpen} whileTap={{ scale: .985 }} transition={spring} onClick={() => setEvidenceOpen((value) => !value)}>
          <span><ShieldCheck size={17} /> 왜 헷갈릴까요</span><em>{analysis.evidence.length}개 이유</em><ChevronDown size={17} />
        </motion.button>
        <AnimatePresence initial={false}>{evidenceOpen && <motion.div className="evidence-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}><ul>{analysis.evidence.map((item) => <li key={item}><i />{item}</li>)}</ul><p><strong>{analysis.caution}</strong></p></motion.div>}</AnimatePresence>
      </div>
      <div className="action-plan-head"><span>배출 방법</span><em>단계별 안내</em></div>
      <div className="action-plan">{analysis.steps.map((step, index) => <div className="action-step" key={step.title}><span className="step-index">{index + 1}</span><div className="step-icon"><Recycle size={20} /></div><div><strong>{step.title}</strong><p>{step.description}</p></div></div>)}</div>
      <WasteChat analysis={analysis} />
    </motion.aside>
  </>;
}

function WasteChat({ analysis }: { analysis: WasteAnalysis }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<WasteChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const suggestions = analysis.status === "confident"
    ? ["뚜껑은 따로 버려요?", "얼마나 씻어야 해요?", "라벨이 안 떼져요"]
    : ["어떤 부분을 찍을까요?", "재질 표시는 어디에 있나요?", "지금 버리면 안 되나요?"];

  useEffect(() => {
    if (open) chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading, open]);

  async function ask(event?: FormEvent, suggestedQuestion?: string) {
    event?.preventDefault();
    const nextQuestion = (suggestedQuestion ?? question).trim();
    if (!nextQuestion || loading) return;

    const history = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: nextQuestion }]);
    setQuestion("");
    setChatError("");
    setLoading(true);

    try {
      const response = await fetch("/api/waste-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, messages: history, question: nextQuestion }),
      });
      const data = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "답변을 만들지 못했습니다.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer! }]);
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "추가 질문을 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`waste-chat ${open ? "open" : ""}`} aria-label="인식 결과 추가 질문">
      <motion.button className="waste-chat-toggle" type="button" aria-expanded={open} whileTap={{ scale: 0.985 }} transition={spring} onClick={() => setOpen((value) => !value)}>
        <span><MessageCircle size={17} /><strong>AI에게 더 물어보기</strong></span>
        <em>{messages.length ? `대화 ${messages.length}개` : "사진 결과에 이어서 질문"}</em>
        <ChevronDown size={17} />
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="waste-chat-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}>
            <div className="chat-context"><Sparkles size={14} /><span><strong>{analysis.itemName}</strong> 인식 결과와 근거를 기억하고 답해요.</span></div>
            {messages.length === 0 && (
              <div className="chat-suggestions">
                {suggestions.map((suggestion) => <motion.button type="button" key={suggestion} whileTap={{ scale: 0.96 }} transition={spring} onClick={() => void ask(undefined, suggestion)}>{suggestion}</motion.button>)}
              </div>
            )}
            {messages.length > 0 && (
              <div className="chat-thread" role="log" aria-live="polite">
                {messages.map((message, index) => <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? "버림 AI" : "나"}</span><p>{message.content}</p></div>)}
                {loading && <div className="chat-bubble assistant loading"><span>버림 AI</span><p><i /><i /><i /></p></div>}
                <div ref={chatEnd} />
              </div>
            )}
            {chatError && <div className="chat-error" role="alert"><TriangleAlert size={14} />{chatError}</div>}
            <form className="chat-composer" onSubmit={(event) => void ask(event)}>
              <label><span className="visually-hidden">추가 질문</span><input value={question} maxLength={400} placeholder="예: 뚜껑은 어떻게 버려요?" onChange={(event) => setQuestion(event.target.value)} /></label>
              <motion.button type="submit" aria-label="질문 보내기" disabled={!question.trim() || loading} whileTap={{ scale: 0.9 }} transition={spring}>{loading ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</motion.button>
            </form>
            <p className="chat-privacy"><ShieldCheck size={12} /> 대화는 답변 생성 중에만 전송되며 저장하지 않아요.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ConfidentResult({ analysis, onDone, onRetry }: { analysis: WasteAnalysis; onDone: () => void; onRetry: () => void }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const stepIcons = [Droplets, RotateCcw, Layers3, Recycle, Bottle];
  return (
    <motion.div className="result-panel" initial={{ y: "100%" }} animate={{ y: 0 }} transition={spring}>
      <div className="result-grabber" />
      <div className="result-head">
        <div className="result-icon"><Bottle size={30} /></div>
        <div>
          <div className="result-meta"><span className="confidence high"><i /> 확신도 {analysis.confidence}%</span><em>{analysis.model === "demo" ? "샘플 판정" : "Gemini 분석"}</em></div>
          <h2>{analysis.itemName}이에요</h2><p>{analysis.material} · {analysis.category}</p>
        </div>
        <button type="button" aria-label="결과 닫기" onClick={onDone}><X size={20} /></button>
      </div>
      <div className="result-summary"><Sparkles size={17} /><p><strong>한 줄 요약</strong>{analysis.summary}</p></div>
      <div className={`evidence-card ${evidenceOpen ? "open" : ""}`}>
        <motion.button type="button" aria-expanded={evidenceOpen} whileTap={{ scale: 0.985 }} transition={spring} onClick={() => setEvidenceOpen((open) => !open)}>
          <span><ShieldCheck size={17} /> AI 판정 근거</span><em>{analysis.evidence.length}개 단서 확인</em><ChevronDown size={17} />
        </motion.button>
        <AnimatePresence initial={false}>
          {evidenceOpen && (
            <motion.div className="evidence-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}>
              <ul>
                {analysis.evidence.map((item) => <li key={item}><i />{item}</li>)}
              </ul>
              <p><strong>확신도는 정답을 보장하지 않아요.</strong> {analysis.caution}</p>
              <a href="https://www.me.go.kr/home/web/board/read.do?boardId=1421040&boardMasterId=713&menuId=10392" target="_blank" rel="noreferrer">
                환경부 공식 기준으로 교차 검증 <ExternalLink size={13} />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="action-plan-head"><span>행동 요령</span><em>약 40초</em></div>
      <div className="action-plan">
        {analysis.steps.map((step, index) => {
          const StepIcon = stepIcons[index % stepIcons.length];
          return (
          <div className="action-step" key={step.title}>
            <span className="step-index">{index + 1}</span>
            <div className="step-icon"><StepIcon size={20} /></div>
            <div><strong>{step.title}</strong><p>{step.description}</p></div>
          </div>
          );
        })}
      </div>
      <WasteChat analysis={analysis} />
      <div className="result-actions">
        <motion.button className="primary-button" type="button" whileTap={{ scale: 0.98 }} transition={spring} onClick={onDone}>
          <Check size={19} /> 확인했어요
        </motion.button>
        <button className="secondary-button" type="button" onClick={onRetry}><RotateCcw size={17} /> 다시 찍기</button>
      </div>
    </motion.div>
  );
}

function UncertainResult({ analysis, onRetry }: { analysis: WasteAnalysis; onRetry: () => void }) {
  return (
    <motion.div className="result-panel uncertain-result" initial={{ y: "100%" }} animate={{ y: 0 }} transition={spring}>
      <div className="result-grabber" />
      <div className="uncertain-hero">
        <span className="uncertain-icon"><CircleHelp size={26} /></span>
        <div className="hold-status"><strong>판정 보류</strong><span className="confidence low"><i /> 확신도 {analysis.confidence}%</span></div>
        <h2>조금만 더 보여주세요</h2>
        <p>{analysis.summary}</p>
      </div>
      <div className="hold-reason"><ShieldCheck size={17} /><p><strong>AI가 추측 대신 멈췄어요.</strong> 잘못 버리는 행동으로 이어지지 않도록 추가 정보부터 요청합니다.</p></div>
      <div className="mission-label"><Sparkles size={15} /> 정확도를 높이는 촬영 미션</div>
      <div className="mission-list">
        {analysis.followUp.map((instruction, index) => (
          <motion.button type="button" key={instruction} whileTap={{ scale: 0.98 }} transition={spring} onClick={onRetry}>
            <span className="mission-number">{index + 1}</span>
            <span className={`mission-visual ${index % 2 === 0 ? "back-label" : "focus"}`}>{index % 2 === 0 ? <PackageOpen size={25} /> : <Crosshair size={25} />}</span>
            <span><strong>{instruction}</strong><small>안내한 단서가 화면 중앙에 선명하게 보이도록 해주세요.</small></span>
            <Camera size={19} />
          </motion.button>
        ))}
      </div>
      <div className="safety-note"><TriangleAlert size={17} /><p><strong>확실해질 때까지 버리지 마세요.</strong>{analysis.caution}</p></div>
      <WasteChat analysis={analysis} />
      <div className="result-actions">
        <motion.button className="primary-button" type="button" whileTap={{ scale: 0.98 }} transition={spring} onClick={onRetry}>
          <Camera size={19} /> 안내대로 다시 찍기
        </motion.button>
      </div>
    </motion.div>
  );
}

function prepareImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("사진을 변환할 수 없습니다."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("사진을 불러올 수 없습니다."));
    };
    image.src = objectUrl;
  });
}

function Scanner({ onClose, onAnalysis }: { onClose: () => void; onAnalysis: (analysis: WasteAnalysis) => void }) {
  const [state, setState] = useState<ScanState>("ready");
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<WasteAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("requesting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const cameraTimeoutRef = useRef<number | null>(null);
  const analysisTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    const requestId = ++cameraRequestRef.current;
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported");
      return;
    }

    setCameraStatus("requesting");
    if (cameraTimeoutRef.current !== null) window.clearTimeout(cameraTimeoutRef.current);
    cameraTimeoutRef.current = window.setTimeout(() => {
      if (requestId === cameraRequestRef.current && !streamRef.current) setCameraStatus("error");
    }, 4_000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (cameraTimeoutRef.current !== null) window.clearTimeout(cameraTimeoutRef.current);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      setCameraStatus("live");
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return;
      if (cameraTimeoutRef.current !== null) window.clearTimeout(cameraTimeoutRef.current);
      stopCamera();
      const errorName = error instanceof DOMException ? error.name : "";
      setCameraStatus(errorName === "NotAllowedError" || errorName === "SecurityError" ? "denied" : "error");
    }
  }, [stopCamera]);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => void startCamera(), 0);
    return () => {
      window.clearTimeout(startupTimer);
      cameraRequestRef.current += 1;
      stopCamera();
      if (cameraTimeoutRef.current !== null) window.clearTimeout(cameraTimeoutRef.current);
      if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  async function analyze(imageDataUrl?: string) {
    cameraRequestRef.current += 1;
    if (cameraTimeoutRef.current !== null) window.clearTimeout(cameraTimeoutRef.current);
    stopCamera();
    setAnalysisError("");
    setState("analyzing");
    if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);

    if (!imageDataUrl) {
      analysisTimerRef.current = window.setTimeout(() => {
        setAnalysis(sampleAnalysis);
        onAnalysis(sampleAnalysis);
        setState("result");
      }, 900);
      return;
    }

    try {
      const response = await fetch("/api/analyze-waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const data = await response.json() as { analysis?: WasteAnalysis; error?: string };
      if (!response.ok || !data.analysis) throw new Error(data.error || "사진을 분석하지 못했습니다.");
      setAnalysis(data.analysis);
      onAnalysis(data.analysis);
      setState(data.analysis.status === "confident" ? "result" : "uncertain");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "사진 분석 중 오류가 발생했습니다.");
      setState("ready");
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState("analyzing");
    setAnalysisError("");
    try {
      const imageDataUrl = await prepareImage(file);
      setPreview(imageDataUrl);
      await analyze(imageDataUrl);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "사진을 불러오지 못했습니다.");
      setState("ready");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (cameraStatus !== "live" || !video || !canvas || video.videoWidth === 0) {
      cameraInput.current?.click();
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraStatus("error");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.82);
    setPreview(imageDataUrl);
    void analyze(imageDataUrl);
  }

  function retry() {
    setState("ready");
    setPreview(null);
    setAnalysis(null);
    setAnalysisError("");
    if (galleryInput.current) galleryInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    window.setTimeout(() => void startCamera(), 120);
  }

  const cameraMessage = {
    requesting: ["카메라 권한을 기다리고 있어요", "권한 창이 보이지 않으면 기기 카메라 열기를 눌러주세요."],
    live: ["카메라가 연결됐어요", "물건을 화면 중앙에 맞춰주세요."],
    denied: ["카메라 권한이 꺼져 있어요", "브라우저 설정에서 허용하거나 기기 카메라로 바로 촬영하세요."],
    unsupported: ["실시간 카메라를 지원하지 않아요", "아래 셔터로 기기 카메라를 열거나 보관함에서 선택할 수 있어요."],
    error: ["실시간 카메라 연결이 지연되고 있어요", "내장 브라우저에서는 제한될 수 있어요. 기기 카메라로 바로 촬영할 수 있습니다."],
  }[cameraStatus];

  return (
    <motion.div
      className="scanner"
      role="dialog"
      aria-modal="true"
      aria-label="AI 분리배출 사진 분석"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, filter: "blur(8px)" }}
      transition={reduceMotion ? { duration: 0.15 } : spring}
    >
      <div className={`camera-stage${preview ? " has-preview" : ""}`} style={preview ? { backgroundImage: `url(${preview})` } : undefined}>
        {!preview && <video ref={videoRef} className={`camera-video${cameraStatus === "live" ? " is-live" : ""}`} autoPlay muted playsInline aria-label="실시간 카메라 화면" />}
        <div className="camera-shade" />
        {!preview && cameraStatus !== "live" && (
          <div className="sample-object" aria-hidden="true">
            <Bottle size={116} strokeWidth={0.9} />
            <span>PET<br />01</span>
          </div>
        )}
        <div className="scanner-head">
          <IconButton label="카메라 닫기" onClick={onClose}><X size={21} /></IconButton>
          <span><Sparkles size={15} /> AI 품목 인식</span>
          <IconButton label="촬영 도움말"><CircleHelp size={21} /></IconButton>
        </div>
        {(state === "ready" || state === "analyzing") && (
          <div className="viewfinder">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            {state === "analyzing" && <motion.div className="live-scan-line" animate={{ y: [0, 260, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />}
          </div>
        )}
        <AnimatePresence mode="wait">
          {state === "ready" && cameraStatus === "live" && (
            <motion.div className="camera-instruction" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <strong>물건 하나만 화면에 맞춰주세요</strong>
              <span>라벨과 재질 표시가 보이면 더 정확해요</span>
            </motion.div>
          )}
          {state === "ready" && cameraStatus !== "live" && (
            <motion.div className={`camera-access ${cameraStatus}`} role="status" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={reduceMotion ? { duration: 0.15 } : spring}>
              <Camera size={21} />
              <div><strong>{cameraMessage[0]}</strong><span>{cameraMessage[1]}</span></div>
              <div className="camera-access-actions">
                <button className="open-device-camera" type="button" onClick={() => cameraInput.current?.click()}>기기 카메라 열기</button>
                {cameraStatus !== "requesting" && <button type="button" onClick={() => void startCamera()}>실시간 다시 연결</button>}
              </div>
            </motion.div>
          )}
          {state === "analyzing" && (
            <motion.div className="analyzing-pill" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
              <span className="analyzing-spinner" />
              <div><strong>사진을 살펴보고 있어요</strong><small>재질과 오염 상태를 확인하는 중</small></div>
            </motion.div>
          )}
          {state === "ready" && analysisError && preview && (
            <motion.div className="analysis-error" role="alert" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={reduceMotion ? { duration: 0.15 } : spring}>
              <TriangleAlert size={20} />
              <div><strong>분석을 완료하지 못했어요</strong><span>{analysisError}</span></div>
              <button type="button" onClick={() => void analyze(preview)}>다시 분석</button>
              <button type="button" onClick={retry}>다른 사진</button>
            </motion.div>
          )}
        </AnimatePresence>
        {state === "ready" && (
          <>
            <div className="photo-privacy"><ShieldCheck size={14} /> 사진은 분석 중에만 Gemini로 전송되며 버림이 저장하지 않아요</div>
            <div className="camera-controls">
              <button className="gallery-button" type="button" aria-label="사진 보관함에서 선택" onClick={() => galleryInput.current?.click()}><ImagePlus size={21} /></button>
              <motion.button className="shutter" type="button" aria-label={cameraStatus === "live" ? "사진 촬영" : "기기 카메라 열기"} whileTap={{ scale: 0.88 }} transition={spring} onClick={capturePhoto}><span /></motion.button>
              <button className="demo-button" type="button" onClick={() => void analyze()}><Sparkles size={17} /><span>샘플<br />체험</span></button>
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="visually-hidden" aria-hidden="true" />
        <input ref={galleryInput} className="visually-hidden" type="file" accept="image/*" onChange={handleFile} />
        <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleFile} />
      </div>
      <AnimatePresence>
        {state === "result" && analysis && <ConfidentResult analysis={analysis} onDone={onClose} onRetry={retry} />}
        {state === "uncertain" && analysis && <UncertainResult analysis={analysis} onRetry={retry} />}
      </AnimatePresence>
    </motion.div>
  );
}

function LandingPage({ onEnter, onLogin }: { onEnter: () => void; onLogin: () => void }) {
  return (
    <motion.main
      className="landing-page"
      data-app-revision="safari-cache-v12"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="landing-header">
        <Brand />
        <div className="landing-header-actions">
          <span>AI 분리배출 가이드</span>
          <motion.button type="button" whileTap={{ scale: 0.96 }} transition={spring} onClick={onLogin}><UserRound size={16} /> 로그인</motion.button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <h1>버리는 순간까지<br />망설이지 않도록.</h1>
          <p>가까운 수거함을 찾고, 사진 한 장으로 품목과 배출 방법을 확인하세요.</p>
          <motion.button
            className="landing-enter"
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={onEnter}
          >
            들어가기
            <ArrowRight size={18} />
          </motion.button>
        </div>
      </section>

      <footer className="landing-footer">
        <span>잘 버리는 가장 빠른 방법 · 버림</span>
        <span>사진 분석 · 위치 찾기 · 행동 요령</span>
      </footer>
    </motion.main>
  );
}

function ProgramShell({
  tab,
  onTabChange,
  onScan,
  onPlace,
  onNotification,
  onBack,
  userLocation,
  locationStatus,
  onLocationRequest,
  collectionPlaces,
  collectionStatus,
  collectionMeta,
  onRefreshCollections,
  authUser,
  authLoading,
  onLogin,
  onSignOut,
  latestAnalysis,
  records,
  monthlyStats,
  onGuide,
  onNeighborhood,
  onNotificationSettings,
  onFavorites,
  onHelp,
  notificationsEnabled,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onScan: () => void;
  onPlace: (place: Place) => void;
  onNotification: () => void;
  onBack: () => void;
  userLocation: UserLocation | null;
  locationStatus: LocationStatus;
  onLocationRequest: () => void;
  collectionPlaces: Place[];
  collectionStatus: CollectionStatus;
  collectionMeta: CollectionMeta | null;
  onRefreshCollections: () => void;
  authUser: User | null;
  authLoading: boolean;
  onLogin: () => void;
  onSignOut: () => void;
  latestAnalysis: WasteAnalysis | null;
  records: WasteRecord[];
  monthlyStats: MonthlyStats;
  onGuide: (analysis: WasteAnalysis) => void;
  onNeighborhood: () => void;
  onNotificationSettings: () => void;
  onFavorites: () => void;
  onHelp: () => void;
  notificationsEnabled: boolean;
}) {
  return (
    <motion.div
      className="program-shell"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={spring}
    >
      <div className="program-frame">
        <Header onNotification={onNotification} onBack={onBack} locationStatus={locationStatus} onLocationRequest={onLocationRequest} notificationActive={notificationsEnabled} />
        <BottomNav tab={tab} onChange={onTabChange} onScan={onScan} />
        <AnimatePresence mode="wait">
          {tab === "home" && <HomeView key="home" onScan={onScan} onMap={() => onTabChange("map")} onPlace={onPlace} onGuide={onGuide} userLocation={userLocation} collectionPlaces={collectionPlaces} collectionStatus={collectionStatus} monthCount={monthlyStats.thisMonthCount} />}
          {tab === "map" && <MapView key="map" onPlace={onPlace} userLocation={userLocation} locationStatus={locationStatus} onLocationRequest={onLocationRequest} collectionPlaces={collectionPlaces} collectionStatus={collectionStatus} collectionMeta={collectionMeta} onRefreshCollections={onRefreshCollections} />}
          {tab === "ai" && <UnifiedAiView key="ai" analysis={latestAnalysis} userLocation={userLocation} places={collectionPlaces} onScan={onScan} onMap={() => onTabChange("map")} />}
          {tab === "history" && <HistoryView key="history" onScan={onScan} records={records} monthlyStats={monthlyStats} />}
          {tab === "profile" && <ProfileView key="profile" user={authUser} loading={authLoading} onLogin={onLogin} onSignOut={onSignOut} onNeighborhood={onNeighborhood} onNotificationSettings={onNotificationSettings} onFavorites={onFavorites} onHelp={onHelp} notificationsEnabled={notificationsEnabled} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function WasteApp() {
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<WasteAnalysis | null>(null);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [collectionPlaces, setCollectionPlaces] = useState<Place[]>(demoPlaces);
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus>("demo");
  const [collectionMeta, setCollectionMeta] = useState<CollectionMeta | null>(null);
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [latestAnalysis, setLatestAnalysis] = useState<WasteAnalysis | null>(null);
  const [records, setRecords] = useState<WasteRecord[]>(() => loadGuestRecords());
  const monthlyStats = computeMonthlyStats(records);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    let active = true;
    client.auth.getUser().then(({ data }) => {
      if (active) {
        const user = data.user ?? null;
        setAuthUser(user);
        setRecords(user ? loadRecordsFromUser(user) : loadGuestRecords());
        setAuthLoading(false);
      }
    }).catch(() => {
      if (active) setAuthLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user ?? null;
      setAuthUser(user);
      setRecords(user ? loadRecordsFromUser(user) : loadGuestRecords());
      setAuthLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userLocation) return;
    const controller = new AbortController();

    fetchCollectionPlaces(userLocation, controller.signal)
      .then(({ places: nextPlaces, meta }) => {
        setCollectionPlaces(nextPlaces);
        setCollectionMeta(meta);
        setCollectionStatus(nextPlaces.length ? "success" : "empty");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCollectionPlaces([]);
          setCollectionMeta(null);
          setCollectionStatus("error");
        }
      });

    return () => controller.abort();
  }, [collectionRefresh, userLocation]);

  function refreshCollections() {
    if (!userLocation) {
      requestLocation();
      return;
    }
    setCollectionStatus("loading");
    setCollectionPlaces([]);
    setCollectionMeta(null);
    setCollectionRefresh((value) => value + 1);
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      return;
    }

    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCollectionStatus("loading");
        setCollectionPlaces([]);
        setCollectionMeta(null);
        setUserLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        setLocationStatus("granted");
      },
      (error) => {
        setLocationStatus(error.code === 1 ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function changeTab(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showNotice(title: string, body: string) { setNotice({ title, body }); }
  function openTopNotification() {
    showNotice(notificationsEnabled ? "오늘은 페트병 배출일이에요" : "알림이 꺼져 있어요", notificationsEnabled ? "오후 8시 전까지 문 앞에 내놓아 주세요." : "내 정보에서 분리배출 알림을 다시 켤 수 있어요.");
  }
  function openNeighborhoodSetting() {
    setTab("map");
    showNotice("내 동네 설정", "현재 위치를 다시 확인하고 주변 수거함을 갱신할게요.");
    requestLocation();
  }
  function toggleNotificationSetting() {
    setNotificationsEnabled((current) => {
      const next = !current;
      showNotice(next ? "분리배출 알림 켜짐" : "분리배출 알림 꺼짐", next ? "상단 알림 버튼과 연동되었어요." : "언제든 내 정보에서 다시 켤 수 있어요.");
      return next;
    });
  }
  function openFavoriteCollection() {
    const nearest = userLocation ? [...collectionPlaces].sort((a, b) => distanceInMeters(userLocation, a) - distanceInMeters(userLocation, b))[0] : collectionPlaces[0];
    setTab("map");
    if (nearest) setSelectedPlace(nearest);
    else showNotice("즐겨찾는 수거함", "표시할 지점이 없어요. 위치를 먼저 갱신해 주세요.");
  }
  function openHelpAndFeedback() {
    showNotice("도움말 및 제보", "문의 메일 앱을 열었어요.");
    window.open("mailto:beorim.help@gmail.com?subject=%5B%EB%B2%84%EB%A6%BC%5D%20%EB%8F%84%EC%9B%80%EB%A7%90%20%EB%B0%8F%20%EC%A0%9C%EB%B3%B4");
  }

  function leaveProgram() {
    setScannerOpen(false);
    setSelectedPlace(null);
    setSelectedGuide(null);
    setNotice(null);
    setEntered(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    await client.auth.signOut();
    setAuthUser(null);
    setRecords(loadGuestRecords());
  }

  function rememberAnalysis(analysis: WasteAnalysis) {
    setLatestAnalysis(analysis);
    if (analysis.status !== "confident") return;
    const record = createRecord(analysis);
    setRecords((previous) => {
      const next = addRecord(previous, record);
      if (authUser) {
        void getSupabaseBrowserClient()?.auth.updateUser({ data: { wasteRecords: next } });
      } else {
        saveGuestRecords(next);
      }
      return next;
    });
  }

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {!entered ? (
          <LandingPage key="landing" onEnter={() => { setEntered(true); requestLocation(); }} onLogin={() => setAuthOpen(true)} />
        ) : (
          <ProgramShell
            key="program"
            tab={tab}
            onTabChange={changeTab}
            onScan={() => setScannerOpen(true)}
            onPlace={setSelectedPlace}
            onNotification={openTopNotification}
            onBack={leaveProgram}
            userLocation={userLocation}
            locationStatus={locationStatus}
            onLocationRequest={requestLocation}
            collectionPlaces={collectionPlaces}
            collectionStatus={collectionStatus}
            collectionMeta={collectionMeta}
            onRefreshCollections={refreshCollections}
            authUser={authUser}
            authLoading={authLoading}
            onLogin={() => setAuthOpen(true)}
            onSignOut={() => void signOut()}
            latestAnalysis={latestAnalysis}
            records={records}
            monthlyStats={monthlyStats}
            onGuide={setSelectedGuide}
            onNeighborhood={openNeighborhoodSetting}
            onNotificationSettings={toggleNotificationSetting}
            onFavorites={openFavoriteCollection}
            onHelp={openHelpAndFeedback}
            notificationsEnabled={notificationsEnabled}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {authOpen && <AuthDialog key="auth-dialog" onClose={() => setAuthOpen(false)} />}
        {entered && scannerOpen && <Scanner onClose={() => setScannerOpen(false)} onAnalysis={rememberAnalysis} />}
        {entered && selectedPlace && <PlaceSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} />}
        {entered && selectedGuide && <GuideSheet analysis={selectedGuide} onClose={() => setSelectedGuide(null)} />}
        {entered && notice && (
          <motion.div className="notice-toast" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
            <span><Bell size={17} /></span><p><strong>{notice.title}</strong>{notice.body}</p><button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><X size={17} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
