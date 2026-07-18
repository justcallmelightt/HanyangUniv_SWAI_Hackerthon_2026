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
  Navigation,
  PackageOpen,
  Recycle,
  RotateCcw,
  ScanLine,
  Search,
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

type Tab = "home" | "map" | "history" | "profile";
type ScanState = "ready" | "analyzing" | "result" | "uncertain";
type CameraStatus = "requesting" | "live" | "denied" | "unsupported" | "error";
type LocationStatus = "idle" | "loading" | "granted" | "denied" | "unavailable";
type CollectionStatus = "demo" | "loading" | "success" | "empty" | "error";
type UserLocation = { lat: number; lng: number; accuracy: number };
type CollectionMeta = { source: string; radiusKm: number; fetchedAt: string; fallbackServers: number };
type AuthMode = "login" | "signup";

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
}: {
  onNotification: () => void;
  onBack: () => void;
  locationStatus: LocationStatus;
  onLocationRequest: () => void;
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
          <span className="notification-dot" />
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
}: {
  onScan: () => void;
  onMap: () => void;
  onPlace: (place: Place) => void;
  userLocation: UserLocation | null;
  collectionPlaces: Place[];
  collectionStatus: CollectionStatus;
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
        <div className="impact-badge" aria-label="이번 달 12개 올바르게 분리배출">
          <Recycle size={16} />
          <strong>12</strong>
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
          <motion.button type="button" whileTap={{ scale: 0.97 }} transition={spring}>
            <span className="guide-icon yellow"><GlassWater size={23} /></span>
            <span><strong>깨진 유리</strong><small>신문지에 감싸 일반쓰레기</small></span>
            <ChevronRight size={17} />
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.97 }} transition={spring}>
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

function HistoryView({ onScan }: { onScan: () => void }) {
  const records = [
    { icon: Bottle, name: "투명 페트병", info: "플라스틱 · 재활용", time: "오늘, 오후 2:32", tone: "mint" },
    { icon: PackageOpen, name: "코팅된 택배 봉투", info: "비닐 · 라벨 분리", time: "어제, 오후 7:18", tone: "lilac" },
    { icon: GlassWater, name: "갈색 유리병", info: "유리 · 내용물 비우기", time: "7월 15일", tone: "yellow" },
  ];

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
        <p>작은 실천이 이번 달 탄소 2.4kg을 줄였어요.</p>
      </div>
      <div className="impact-card">
        <div>
          <span>7월의 올바른 분리배출</span>
          <strong>12<small>개</small></strong>
        </div>
        <div className="impact-ring"><span>+4</span><small>지난달보다</small></div>
      </div>
      <div className="record-heading"><strong>최근 분석</strong><button type="button">전체 보기</button></div>
      <div className="record-list">
        {records.map((record) => (
          <button type="button" key={record.name}>
            <span className={`record-icon ${record.tone}`}><record.icon size={23} /></span>
            <span className="record-copy"><strong>{record.name}</strong><small>{record.info}</small><em>{record.time}</em></span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
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

        {!isSupabaseConfigured && (
          <p className="auth-setup-note"><TriangleAlert size={14} /> 현재는 게스트 모드예요. Supabase 환경 변수를 등록하면 로그인이 활성화됩니다.</p>
        )}
      </motion.section>
    </>
  );
}

function ProfileView({ user, loading, onLogin, onSignOut }: { user: User | null; loading: boolean; onLogin: () => void; onSignOut: () => void }) {
  const displayName = user ? authDisplayName(user) : "";
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
            <small className="guest-note"><ShieldCheck size={13} /> 로그인하지 않아도 사진 분석과 지도는 모두 이용할 수 있어요.</small>
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
          <div><i>03</i><span><strong>사진을 남기지 않기</strong><small>현재 MVP는 사진을 서버로 전송하지 않아요.</small></span></div>
        </div>
      </section>
      <div className="settings-list">
        {["내 동네 설정", "분리배출 알림", "즐겨찾는 수거함", "도움말 및 제보"].map((item, index) => (
          <button type="button" key={item}>
            <span>{index === 0 ? <MapPin size={19} /> : index === 1 ? <Bell size={19} /> : index === 2 ? <Recycle size={19} /> : <CircleHelp size={19} />}</span>
            <strong>{item}</strong>
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

function ConfidentResult({ onUncertain, onDone, onRetry }: { onUncertain: () => void; onDone: () => void; onRetry: () => void }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const steps = [
    { icon: Droplets, title: "내용물을 완전히 비워요", desc: "남아 있는 음료는 싱크대에 버려주세요." },
    { icon: RotateCcw, title: "물로 한 번 가볍게 헹궈요", desc: "세제까지 사용할 필요는 없어요." },
    { icon: Layers3, title: "라벨을 떼어 비닐류로 분리해요", desc: "접착제가 남아도 괜찮아요." },
    { icon: Bottle, title: "찌그러뜨린 뒤 뚜껑을 닫아요", desc: "투명 페트병 전용 수거함에 넣어주세요." },
  ];
  return (
    <motion.div className="result-panel" initial={{ y: "100%" }} animate={{ y: 0 }} transition={spring}>
      <div className="result-grabber" />
      <div className="result-head">
        <div className="result-icon"><Bottle size={30} /></div>
        <div>
          <div className="result-meta"><span className="confidence high"><i /> 확신도 92%</span><em>MVP 샘플 판정</em></div>
          <h2>투명 페트병이에요</h2><p>무색 PET · 재활용 가능</p>
        </div>
        <button type="button" aria-label="결과 닫기" onClick={onDone}><X size={20} /></button>
      </div>
      <div className="result-summary"><Sparkles size={17} /><p><strong>한 줄 요약</strong>비우고, 헹구고, 라벨을 뗀 뒤 찌그러뜨려 배출하세요.</p></div>
      <div className={`evidence-card ${evidenceOpen ? "open" : ""}`}>
        <motion.button type="button" aria-expanded={evidenceOpen} whileTap={{ scale: 0.985 }} transition={spring} onClick={() => setEvidenceOpen((open) => !open)}>
          <span><ShieldCheck size={17} /> AI 판정 근거</span><em>3개 단서 확인</em><ChevronDown size={17} />
        </motion.button>
        <AnimatePresence initial={false}>
          {evidenceOpen && (
            <motion.div className="evidence-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}>
              <ul>
                <li><i />투명한 음료 용기 형태</li>
                <li><i />재질 표시 PET 01</li>
                <li><i />분리 가능한 라벨 확인</li>
              </ul>
              <p><strong>확신도는 정답을 보장하지 않아요.</strong> AI가 관찰한 단서의 일치 정도이며, 지역별 배출 기준이 다를 수 있어요.</p>
              <a href="https://www.me.go.kr/home/web/board/read.do?boardId=1421040&boardMasterId=713&menuId=10392" target="_blank" rel="noreferrer">
                환경부 공식 기준으로 교차 검증 <ExternalLink size={13} />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="action-plan-head"><span>행동 요령</span><em>약 40초</em></div>
      <div className="action-plan">
        {steps.map((step, index) => (
          <div className="action-step" key={step.title}>
            <span className="step-index">{index + 1}</span>
            <div className="step-icon"><step.icon size={20} /></div>
            <div><strong>{step.title}</strong><p>{step.desc}</p></div>
          </div>
        ))}
      </div>
      <div className="result-actions">
        <motion.button className="primary-button" type="button" whileTap={{ scale: 0.98 }} transition={spring} onClick={onDone}>
          <Check size={19} /> 확인했어요
        </motion.button>
        <button className="secondary-button" type="button" onClick={onRetry}><RotateCcw size={17} /> 다시 찍기</button>
      </div>
      <button className="uncertain-preview" type="button" onClick={onUncertain}>
        <TriangleAlert size={16} /> AI가 확신하지 못했을 때의 안내 보기 <ChevronRight size={16} />
      </button>
    </motion.div>
  );
}

function UncertainResult({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <motion.div className="result-panel uncertain-result" initial={{ y: "100%" }} animate={{ y: 0 }} transition={spring}>
      <div className="result-grabber" />
      <div className="uncertain-hero">
        <span className="uncertain-icon"><CircleHelp size={26} /></span>
        <div className="hold-status"><strong>판정 보류</strong><span className="confidence low"><i /> 확신도 54%</span></div>
        <h2>조금만 더 보여주세요</h2>
        <p>플라스틱 용기로 보이지만, 재질 표시가 보이지 않아 정확한 판단이 어려워요.</p>
      </div>
      <div className="hold-reason"><ShieldCheck size={17} /><p><strong>AI가 추측 대신 멈췄어요.</strong> 잘못 버리는 행동으로 이어지지 않도록 추가 정보부터 요청합니다.</p></div>
      <div className="mission-label"><Sparkles size={15} /> 정확도를 높이는 촬영 미션</div>
      <div className="mission-list">
        <motion.button type="button" whileTap={{ scale: 0.98 }} transition={spring} onClick={onRetry}>
          <span className="mission-number">1</span>
          <span className="mission-visual back-label"><PackageOpen size={25} /></span>
          <span><strong>용기 뒷면을 보여주세요</strong><small>삼각형 재질 표시와 숫자가 보이게 찍어주세요.</small></span>
          <Camera size={19} />
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.98 }} transition={spring} onClick={onRetry}>
          <span className="mission-number">2</span>
          <span className="mission-visual focus"><Crosshair size={25} /></span>
          <span><strong>흔들림 없이 가까이 찍어주세요</strong><small>물건 하나가 화면의 70% 이상 보이면 좋아요.</small></span>
          <Camera size={19} />
        </motion.button>
      </div>
      <div className="safety-note"><TriangleAlert size={17} /><p><strong>확실해질 때까지 버리지 마세요.</strong>재질이 다르면 배출 방법도 달라질 수 있어요.</p></div>
      <div className="result-actions">
        <motion.button className="primary-button" type="button" whileTap={{ scale: 0.98 }} transition={spring} onClick={onRetry}>
          <Camera size={19} /> 안내대로 다시 찍기
        </motion.button>
        <button className="secondary-button" type="button" onClick={onBack}><ArrowLeft size={17} /> 이전 결과로</button>
      </div>
    </motion.div>
  );
}

function Scanner({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<ScanState>("ready");
  const [preview, setPreview] = useState<string | null>(null);
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

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function analyze() {
    cameraRequestRef.current += 1;
    if (cameraTimeoutRef.current !== null) window.clearTimeout(cameraTimeoutRef.current);
    stopCamera();
    setState("analyzing");
    if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
    analysisTimerRef.current = window.setTimeout(() => setState("result"), 1500);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    analyze();
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
    if (preview) URL.revokeObjectURL(preview);
    setPreview(canvas.toDataURL("image/jpeg", 0.9));
    analyze();
  }

  function retry() {
    setState("ready");
    setPreview(null);
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
        </AnimatePresence>
        {state === "ready" && (
          <>
            <div className="photo-privacy"><ShieldCheck size={14} /> 현재 MVP는 사진을 서버로 전송하거나 저장하지 않아요</div>
            <div className="camera-controls">
              <button className="gallery-button" type="button" aria-label="사진 보관함에서 선택" onClick={() => galleryInput.current?.click()}><ImagePlus size={21} /></button>
              <motion.button className="shutter" type="button" aria-label={cameraStatus === "live" ? "사진 촬영" : "기기 카메라 열기"} whileTap={{ scale: 0.88 }} transition={spring} onClick={capturePhoto}><span /></motion.button>
              <button className="demo-button" type="button" onClick={analyze}><Sparkles size={17} /><span>샘플<br />체험</span></button>
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="visually-hidden" aria-hidden="true" />
        <input ref={galleryInput} className="visually-hidden" type="file" accept="image/*" onChange={handleFile} />
        <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleFile} />
      </div>
      <AnimatePresence>
        {state === "result" && <ConfidentResult onUncertain={() => setState("uncertain")} onDone={onClose} onRetry={retry} />}
        {state === "uncertain" && <UncertainResult onRetry={retry} onBack={() => setState("result")} />}
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
        <Header onNotification={onNotification} onBack={onBack} locationStatus={locationStatus} onLocationRequest={onLocationRequest} />
        <BottomNav tab={tab} onChange={onTabChange} onScan={onScan} />
        <AnimatePresence mode="wait">
          {tab === "home" && <HomeView key="home" onScan={onScan} onMap={() => onTabChange("map")} onPlace={onPlace} userLocation={userLocation} collectionPlaces={collectionPlaces} collectionStatus={collectionStatus} />}
          {tab === "map" && <MapView key="map" onPlace={onPlace} userLocation={userLocation} locationStatus={locationStatus} onLocationRequest={onLocationRequest} collectionPlaces={collectionPlaces} collectionStatus={collectionStatus} collectionMeta={collectionMeta} onRefreshCollections={onRefreshCollections} />}
          {tab === "history" && <HistoryView key="history" onScan={onScan} />}
          {tab === "profile" && <ProfileView key="profile" user={authUser} loading={authLoading} onLogin={onLogin} onSignOut={onSignOut} />}
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
  const [notice, setNotice] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [collectionPlaces, setCollectionPlaces] = useState<Place[]>(demoPlaces);
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus>("demo");
  const [collectionMeta, setCollectionMeta] = useState<CollectionMeta | null>(null);
  const [collectionRefresh, setCollectionRefresh] = useState(0);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    let active = true;
    client.auth.getUser().then(({ data }) => {
      if (active) {
        setAuthUser(data.user ?? null);
        setAuthLoading(false);
      }
    }).catch(() => {
      if (active) setAuthLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthUser(session?.user ?? null);
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

  function leaveProgram() {
    setScannerOpen(false);
    setSelectedPlace(null);
    setNotice(false);
    setEntered(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    await client.auth.signOut();
    setAuthUser(null);
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
            onNotification={() => setNotice(true)}
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
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {authOpen && <AuthDialog key="auth-dialog" onClose={() => setAuthOpen(false)} />}
        {entered && scannerOpen && <Scanner onClose={() => setScannerOpen(false)} />}
        {entered && selectedPlace && <PlaceSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} />}
        {entered && notice && (
          <motion.div className="notice-toast" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
            <span><Bell size={17} /></span><p><strong>오늘은 페트병 배출일이에요</strong>오후 8시 전까지 문 앞에 내놓아 주세요.</p><button type="button" aria-label="알림 닫기" onClick={() => setNotice(false)}><X size={17} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
