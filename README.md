# WasteSuperApp(가명) — 버림

> 버리는 순간까지 망설이지 않도록.

가까운 분리배출 장소를 찾고, 사진 한 장으로 쓰레기의 종류와 올바른 배출 방법을 확인할 수 있는 분리배출 Super App입니다.

## 배포 주소

[WasteSuperApp 실행하기](https://wastesuper.vercel.app)

## 주요 기능

- OpenStreetMap 실지도에서 주변 분리수거장과 쓰레기통 위치 확인
- 브라우저 위치 권한을 통한 현재 위치 표시와 거리순 정렬
- 실시간 후면 카메라 촬영 또는 이미지 업로드를 통한 Gemini 품목 분석
- 품목별 단계형 분리배출 행동 요령 제공
- 인식한 품목과 근거를 기억하는 Gemini 후속 질문 대화
- 분석이 불확실할 때 뒷면 촬영, 흔들림 개선 등 추가 촬영 안내
- AI가 확인한 시각 단서, 확신도의 한계, 공식 검증 출처 공개
- 낮은 확신도에서는 추측하지 않고 판정을 보류하는 안전장치
- 분석 이미지를 일시적으로만 Gemini API에 전달하고 앱에 저장하지 않는 개인정보 보호 구조
- 최근 분석 기록과 분리배출 활동 확인
- 이메일·비밀번호 및 Google 계정 로그인, 세션 유지, 로그아웃
- 로그인 없이도 모든 핵심 기능을 확인할 수 있는 게스트 모드
- 데스크톱과 모바일 화면 대응

> 실제 사진과 후속 질문은 Gemini 3.1 Flash-Lite로 처리합니다. `샘플 체험` 버튼은 API 장애 상황에서도 시연할 수 있는 고정 데모이며, 수거 지점은 위치 권한 허용 후 OpenStreetMap Overpass API의 실제 등록 데이터를 조회합니다.

## 카메라

- 사진 분석 화면을 열면 브라우저가 카메라 권한을 요청하고 실시간 화면을 표시합니다.
- 셔터를 누르면 현재 프레임을 촬영하며, 사진 보관함 선택은 별도 버튼으로 제공합니다.
- 실시간 카메라를 사용할 수 없는 환경에서는 모바일 기기의 기본 카메라 입력으로 전환합니다.
- 권한 창이 나타나지 않는 내장 브라우저에서도 `기기 카메라 열기` 버튼과 셔터를 바로 사용할 수 있습니다.
- 촬영한 이미지는 브라우저에서 최대 1600px JPEG로 축소한 뒤 서버를 거쳐 Gemini API에 전달합니다.
- API 키는 서버 환경 변수에만 보관되며 브라우저 코드에 노출되지 않습니다.
- 분석이 끝난 이미지를 앱 서버나 데이터베이스에 저장하지 않습니다. Google 무료 등급의 데이터 처리 정책은 Google AI Studio 약관을 함께 확인하세요.
- 분석 결과에서 `AI에게 더 물어보기`를 열면 뚜껑, 세척, 라벨처럼 이어지는 질문을 할 수 있습니다.
- 후속 대화는 최근 6개 메시지만 요청 문맥으로 사용하고 앱 서버나 데이터베이스에 저장하지 않습니다.

## 위치 및 지도

- 앱에 들어갈 때 브라우저가 위치 권한을 요청합니다.
- 권한을 허용하면 지도에 현재 위치와 위치 정확도 범위가 표시됩니다.
- 앱 서버가 OpenStreetMap Overpass API에서 반경 15km의 실제 분리수거·폐기물 수거 지점을 조회합니다.
- 브라우저가 외부 API를 직접 호출하지 않으며, 3개의 공개 데이터 서버를 순차 재시도합니다.
- 일반 쓰레기통과 재활용품 무인회수기도 함께 조회합니다.
- 분리배출 장소는 현재 위치와의 직선거리 순서로 정렬됩니다.
- 페트병, 폐건전지, 소형가전 수거 품목 필터를 지원합니다.
- 각 장소에서 OpenStreetMap 원본 정보와 Google 지도 길찾기를 열 수 있습니다.
- 지도는 Leaflet과 OpenStreetMap을 사용하며 지도 안에 저작자 표시를 제공합니다.
- 위치 권한을 허용하기 전에는 UI 확인용 데모 지점을 표시하며, 실제 조회가 시작되면 데모 데이터는 제거됩니다.
- 검색 결과의 수와 품목 정보는 OpenStreetMap에 등록된 공개 데이터 범위에 따라 달라질 수 있습니다.
- 공개 데이터 서버 응답은 짧게 캐시하여 서버 부담과 반복 조회 지연을 줄입니다.

## Responsible AI 원칙

버림은 AI의 답을 그대로 정답처럼 보여주지 않습니다.

- **모르면 멈추기:** 확신도가 낮으면 재질을 추측하지 않고 추가 촬영을 요청합니다.
- **근거를 보여주기:** 판정에 사용한 시각 단서와 확신도의 의미를 사용자에게 공개합니다.
- **공식 기준 교차 검증:** 행동 요령은 환경부 분리배출 기준과 비교하여 확인합니다.
- **개인정보 최소화:** 이미지는 분석 요청에만 사용하고 앱 서버나 데이터베이스에 보관하지 않습니다.
- **한계 투명화:** 사용 모델과 확신도를 결과 화면에 표시하고, 확신도 75% 미만은 자동으로 판정을 보류합니다.

공식 검증 자료: [환경부 투명 페트병 분리배출 안내](https://www.me.go.kr/home/web/board/read.do?boardId=1421040&boardMasterId=713&menuId=10392)

## 기술 스택

- React 19
- Next.js 16 / vinext
- TypeScript
- Motion
- Lucide React
- Cloudflare Workers 호환 빌드
- Gemini 2.5 Flash-Lite (사진 품목 인식)

## 실행 방법

### 1. 저장소 내려받기

```bash
git clone https://github.com/justcallmelightt/HanyangUniv_SWAI_Hackathon_2026.git
cd HanyangUniv_SWAI_Hackathon_2026
```

### 2. 패키지 설치

Node.js `22.13.0` 이상이 필요합니다.

```bash
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

터미널에 표시되는 주소를 브라우저에서 엽니다.

```text
http://localhost:3000
```

`3000` 포트가 사용 중이면 `3001`처럼 다른 주소가 표시될 수 있습니다.

### 4. 실행 종료

실행 중인 터미널에서 `Control + C`를 누릅니다.

## 프로덕션 빌드

```bash
npm run build
npm run start
```

## Gemini 사진 분석 설정

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 Gemini API 키를 발급합니다.
2. 프로젝트 최상위의 `.env.local`에 아래 값을 추가합니다.

```env
GEMINI_API_KEY=발급받은_API_키
GEMINI_MODEL=gemini-3.1-flash-lite
```

`GEMINI_API_KEY`에는 `NEXT_PUBLIC_` 접두사를 붙이지 마세요. 사진과 키는 `/api/analyze-waste`, 후속 대화는 `/api/waste-chat` 서버 경로에서만 처리됩니다. Vercel에서는 `Project → Settings → Environment Variables`에 같은 값을 등록한 뒤 다시 배포합니다.

Gemini 무료 등급은 요청 한도가 있으며, Google 정책에 따라 입력 데이터가 제품 개선에 사용될 수 있습니다. 대회 시연에는 개인 정보나 얼굴이 포함되지 않은 폐기물 사진을 사용하세요.

## 로그인 설정 (Supabase)

로그인을 사용하지 않아도 사진 분석과 지도 등 모든 핵심 기능은 게스트 모드로 실행됩니다. 계정 로그인을 활성화하려면 다음 설정을 추가합니다.

1. [Supabase](https://supabase.com)에서 프로젝트를 만듭니다.
2. Supabase의 `Project Settings → API`에서 Project URL과 Publishable key를 확인합니다.
3. 프로젝트 최상위에 `.env.local` 파일을 만들고 아래 값을 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

4. Supabase의 `Authentication → URL Configuration`에서 로컬 주소와 배포 주소를 Redirect URLs에 등록합니다.
5. Google 로그인을 사용할 경우 `Authentication → Providers → Google`도 활성화합니다.

Vercel에서는 `Project → Settings → Environment Variables`에 같은 두 값을 등록한 뒤 다시 배포합니다. Publishable key만 사용하며 `service_role` 키는 브라우저나 GitHub에 절대 등록하지 않습니다.

## 검사 명령어

```bash
npm run lint
npm test
```

## 주요 파일

```text
app/
├── WasteApp.tsx   # 화면과 주요 인터랙션
├── globals.css    # 전체 디자인과 반응형 스타일
├── layout.tsx     # 메타데이터와 공통 레이아웃
└── page.tsx       # 애플리케이션 진입점

public/
├── PretendardVariable.woff2
└── og.png
```

## 라이선스

해커톤 프로젝트 및 학습 목적으로 제작되었습니다.
