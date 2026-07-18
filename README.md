# WasteSuperApp — 버림

> 버리는 순간까지 망설이지 않도록.

가까운 분리배출 장소를 찾고, 사진 한 장으로 쓰레기의 종류와 올바른 배출 방법을 확인할 수 있는 분리배출 Super App입니다.

## 배포 주소

[WasteSuperApp 실행하기](https://beorim-waste-guide.justcallmelight.chatgpt.site)

## 주요 기능

- 지도에서 주변 분리수거장과 쓰레기통 위치 확인
- 사진 촬영 또는 이미지 업로드를 통한 품목 분석 체험
- 품목별 단계형 분리배출 행동 요령 제공
- 분석이 불확실할 때 뒷면 촬영, 흔들림 개선 등 추가 촬영 안내
- AI가 확인한 시각 단서, 확신도의 한계, 공식 검증 출처 공개
- 낮은 확신도에서는 추측하지 않고 판정을 보류하는 안전장치
- 현재 MVP에서 사진을 서버로 전송하거나 저장하지 않는 개인정보 보호 구조
- 최근 분석 기록과 분리배출 활동 확인
- 데스크톱과 모바일 화면 대응

> 현재 사진 분석 결과와 장소 정보는 샘플 데이터로 동작하는 인터랙티브 MVP입니다.

## Responsible AI 원칙

버림은 AI의 답을 그대로 정답처럼 보여주지 않습니다.

- **모르면 멈추기:** 확신도가 낮으면 재질을 추측하지 않고 추가 촬영을 요청합니다.
- **근거를 보여주기:** 판정에 사용한 시각 단서와 확신도의 의미를 사용자에게 공개합니다.
- **공식 기준 교차 검증:** 행동 요령은 환경부 분리배출 기준과 비교하여 확인합니다.
- **개인정보 최소화:** 현재 MVP의 업로드 사진은 브라우저 미리보기에만 사용되며 서버로 전송되지 않습니다.
- **한계 투명화:** 실제 AI 모델 연동 전 단계의 샘플 판정임을 결과 화면에 명시합니다.

공식 검증 자료: [환경부 투명 페트병 분리배출 안내](https://www.me.go.kr/home/web/board/read.do?boardId=1421040&boardMasterId=713&menuId=10392)

## 기술 스택

- React 19
- Next.js 16 / vinext
- TypeScript
- Motion
- Lucide React
- Cloudflare Workers 호환 빌드

## 실행 방법

### 1. 저장소 내려받기

```bash
git clone https://github.com/justcallmelightt/HanyangUniv_SWAI_Hackerthon.git
cd HanyangUniv_SWAI_Hackerthon
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
