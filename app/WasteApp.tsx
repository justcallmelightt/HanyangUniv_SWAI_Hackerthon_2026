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
  Clock3,
  Crosshair,
  Droplets,
  ExternalLink,
  GlassWater,
  History,
  Home,
  ImagePlus,
  Layers3,
  LocateFixed,
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
  X,
  Zap,
} from "lucide-react";
import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type Tab = "home" | "map" | "history" | "profile";
type ScanState = "ready" | "analyzing" | "result" | "uncertain";

type Place = {
  id: number;
  name: string;
  type: string;
  distance: string;
  walk: string;
  status: string;
  top: string;
  left: string;
  tone: "green" | "black" | "blue";
};

const places: Place[] = [
  {
    id: 1,
    name: "관악구 스마트 분리수거함",
    type: "캔 · 페트 · 투명병",
    distance: "120m",
    walk: "도보 2분",
    status: "지금 이용 가능",
    top: "27%",
    left: "58%",
    tone: "green",
  },
  {
    id: 2,
    name: "미림마이스터고 분리배출존",
    type: "종이 · 플라스틱 · 일반",
    distance: "350m",
    walk: "도보 5분",
    status: "18:00까지",
    top: "54%",
    left: "27%",
    tone: "black",
  },
  {
    id: 3,
    name: "신림동 주민센터 수거함",
    type: "폐건전지 · 형광등 · 소형가전",
    distance: "640m",
    walk: "도보 9분",
    status: "24시간",
    top: "68%",
    left: "69%",
    tone: "blue",
  },
];

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

function Header({ onNotification, onBack }: { onNotification: () => void; onBack: () => void }) {
  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        <button className="back-to-landing" type="button" onClick={onBack}>
          <ArrowLeft size={14} /> 소개
        </button>
        <button className="location-pill" type="button">
          <MapPin size={14} strokeWidth={2.4} />
          신림동
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
}: {
  onPlace: (place: Place) => void;
  onExpand?: () => void;
}) {
  return (
    <div className="map-canvas" role="img" aria-label="주변 분리배출 장소 지도">
      <div className="map-grid" />
      <div className="road road-one"><span>남부순환로</span></div>
      <div className="road road-two"><span>문성로</span></div>
      <div className="road road-three" />
      <div className="map-block block-one" />
      <div className="map-block block-two" />
      <div className="map-block block-three" />
      <div className="map-park"><span>도림천 산책로</span></div>
      {places.map((place, index) => (
        <motion.button
          key={place.id}
          type="button"
          aria-label={`${place.name}, ${place.distance}`}
          className={`map-marker marker-${place.tone}`}
          style={{ top: place.top, left: place.left }}
          initial={{ scale: 0, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ ...spring, delay: index * 0.07 }}
          whileTap={{ scale: 0.86 }}
          onClick={() => onPlace(place)}
        >
          {place.id === 1 ? <Recycle size={18} /> : <MapPin size={17} />}
          {place.id === 1 && <span className="marker-label">가장 가까움</span>}
        </motion.button>
      ))}
      <div className="current-location" aria-label="내 위치">
        <span />
      </div>
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
}: {
  onScan: () => void;
  onMap: () => void;
  onPlace: (place: Place) => void;
}) {
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
          <MiniMap onPlace={onPlace} onExpand={onMap} />
          <button className="nearest-place" type="button" onClick={() => onPlace(places[0])}>
            <div className="place-icon"><Recycle size={20} /></div>
            <div className="place-copy">
              <strong>{places[0].name}</strong>
              <span>{places[0].type}</span>
            </div>
            <div className="place-distance">
              <strong>{places[0].distance}</strong>
              <span>{places[0].walk}</span>
            </div>
          </button>
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

function MapView({ onPlace }: { onPlace: (place: Place) => void }) {
  const [filter, setFilter] = useState("전체");
  const [located, setLocated] = useState(false);

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
          <input aria-label="장소 검색" placeholder="주소나 수거 품목으로 검색" />
        </label>
        <div className="filter-row" role="group" aria-label="수거 품목 필터">
          {["전체", "페트병", "폐건전지", "소형가전"].map((item) => (
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
      </div>
      <div className="full-map-wrap">
        <MiniMap onPlace={onPlace} />
        <motion.button
          className={`locate-button ${located ? "located" : ""}`}
          type="button"
          aria-label="현재 위치로 이동"
          whileTap={{ scale: 0.88 }}
          transition={spring}
          onClick={() => setLocated(true)}
        >
          <LocateFixed size={20} />
        </motion.button>
        <AnimatePresence>
          {located && (
            <motion.div
              className="map-toast"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={spring}
            >
              <Check size={15} /> 현재 위치 기준으로 정렬했어요
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="place-list">
        <div className="list-title"><strong>가까운 순</strong><span>3곳</span></div>
        {places.map((place) => (
          <motion.button
            className="place-row"
            type="button"
            key={place.id}
            whileTap={{ scale: 0.985 }}
            transition={spring}
            onClick={() => onPlace(place)}
          >
            <div className={`place-icon ${place.tone}`}>
              {place.id === 3 ? <Zap size={20} /> : <Recycle size={20} />}
            </div>
            <div className="place-copy">
              <strong>{place.name}</strong>
              <span>{place.type}</span>
              <small><i /> {place.status}</small>
            </div>
            <div className="place-distance">
              <strong>{place.distance}</strong>
              <span>{place.walk}</span>
            </div>
          </motion.button>
        ))}
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

function ProfileView() {
  return (
    <motion.main
      className="view profile-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="profile-card">
        <div className="avatar">민</div>
        <span>환경 새싹 · 레벨 3</span>
        <h1>민준님</h1>
        <p>이번 달 12번의 정확한 분리배출을 실천했어요.</p>
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
          <div><Clock3 size={18} /><span>운영 시간<strong>24시간 이용</strong></span></div>
          <div><Navigation size={18} /><span>현재 위치에서<strong>{place.walk}</strong></span></div>
        </div>
        <div className="accepted-items">
          <span>배출 가능 품목</span>
          <div><i>페트</i><i>캔</i><i>유리</i><i>종이</i></div>
        </div>
        <motion.button className="primary-button" type="button" whileTap={{ scale: 0.98 }} transition={spring}>
          <Navigation size={19} /> 길찾기 시작
        </motion.button>
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
  const fileInput = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function analyze() {
    setState("analyzing");
    window.setTimeout(() => setState("result"), 1500);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    analyze();
  }

  function retry() {
    setState("ready");
    if (fileInput.current) fileInput.current.value = "";
    window.setTimeout(() => fileInput.current?.click(), 120);
  }

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
      <div className="camera-stage" style={preview ? { backgroundImage: `url(${preview})` } : undefined}>
        <div className="camera-shade" />
        {!preview && (
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
          {state === "ready" && (
            <motion.div className="camera-instruction" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <strong>물건 하나만 화면에 맞춰주세요</strong>
              <span>라벨과 재질 표시가 보이면 더 정확해요</span>
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
              <button className="gallery-button" type="button" aria-label="사진 보관함에서 선택" onClick={() => fileInput.current?.click()}><ImagePlus size={21} /></button>
              <motion.button className="shutter" type="button" aria-label="사진 촬영" whileTap={{ scale: 0.88 }} transition={spring} onClick={() => fileInput.current?.click()}><span /></motion.button>
              <button className="demo-button" type="button" onClick={analyze}><Sparkles size={17} /><span>샘플<br />체험</span></button>
            </div>
          </>
        )}
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleFile} />
      </div>
      <AnimatePresence>
        {state === "result" && <ConfidentResult onUncertain={() => setState("uncertain")} onDone={onClose} onRetry={retry} />}
        {state === "uncertain" && <UncertainResult onRetry={retry} onBack={() => setState("result")} />}
      </AnimatePresence>
    </motion.div>
  );
}

function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <motion.main
      className="landing-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="landing-header">
        <Brand />
        <span>AI 분리배출 가이드</span>
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
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onScan: () => void;
  onPlace: (place: Place) => void;
  onNotification: () => void;
  onBack: () => void;
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
        <Header onNotification={onNotification} onBack={onBack} />
        <BottomNav tab={tab} onChange={onTabChange} onScan={onScan} />
        <AnimatePresence mode="wait">
          {tab === "home" && <HomeView key="home" onScan={onScan} onMap={() => onTabChange("map")} onPlace={onPlace} />}
          {tab === "map" && <MapView key="map" onPlace={onPlace} />}
          {tab === "history" && <HistoryView key="history" onScan={onScan} />}
          {tab === "profile" && <ProfileView key="profile" />}
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

  return (
    <>
      <AnimatePresence mode="wait">
        {!entered ? (
          <LandingPage key="landing" onEnter={() => setEntered(true)} />
        ) : (
          <ProgramShell
            key="program"
            tab={tab}
            onTabChange={changeTab}
            onScan={() => setScannerOpen(true)}
            onPlace={setSelectedPlace}
            onNotification={() => setNotice(true)}
            onBack={leaveProgram}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
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
