# Application

브라우저에서 바로 사용할 수 있는 개인용 웹 애플리케이션과 실험 프로젝트를 모아둔 저장소입니다.

각 프로젝트는 가능한 한 설치 없이 사용할 수 있도록 구성하며, GitHub Pages를 통해 배포합니다.

> **Application Launcher**  
> https://github.writeaday.click/application/

---

## Apps & Tools

| 프로젝트 | 경로 | 설명 |
| --- | --- | --- |
| **GPX Studio** | [gpx-edit](https://github.writeaday.click/application/gpx-edit/) | GPX 구간 자르기, 경로 삭제, 트랙 분할, 웨이포인트 편집 및 GPX 1.1 저장 |
| **MovEdit** | [movedit](https://github.writeaday.click/application/movedit/) | 브라우저 기반 영상 편집, 자막, Overlay, Transition, Audio 분리 및 MP4 렌더링 |
| **HTML Edit** | [htmledit](https://github.writeaday.click/application/htmledit/) | HTML 파일을 화면에서 직접 클릭하며 텍스트·속성·스타일·요소를 편집하는 비주얼 HTML 편집기 |
| **Magic QR Tree** | [magic-qr-tree](https://github.writeaday.click/application/magic-qr-tree/) | URL을 QR로 변환하고 3D 나무·지형으로 시각화하는 인터랙티브 WebGL 앱 |
| **세종대 점심픽** | [sejonglaunch](https://github.writeaday.click/application/sejonglaunch/) | 거리·가격·분류 조건을 기반으로 점심 식당을 추천하는 도구 |
| **GPX Navi** | [gpxnavi](https://github.writeaday.click/application/gpxnavi/) | GPX 경로, 현재 위치, 남은 거리, 경로 이탈 여부를 확인하는 내비게이션 |
| **자전거 트래커** | [bike](https://github.writeaday.click/application/bike/) | 주행 시간, 현재 속도, 최고 속도, 고도와 위치를 확인하는 라이딩 도구 |
| **자전거 휴대승차 안내** | [bicycle_transport](https://github.writeaday.click/application/bicycle_transport/) | 철도·도시철도별 자전거 휴대승차 가능 여부를 정리한 정보 페이지 |
| **Lotto 6/45 Probability Lab** | [lotto](https://github.writeaday.click/application/lotto/lotto.html) | 로또 번호 조합과 확률 개념을 실험하는 웹 도구 |
| **Mind Map** | [mindmap](https://github.writeaday.click/application/mindmap/) | 노드 추가·삭제, 저장·불러오기, 가져오기·내보내기를 지원하는 마인드맵 |
| **WebP → PNG Converter** | [convert](https://github.writeaday.click/application/convert/img2img.html) | 여러 WebP 이미지를 브라우저에서 PNG로 변환 |
| **Dice Roller** | [dice / ver2](https://github.writeaday.click/application/dice/ver2/) | 1~6 사이의 주사위 값을 무작위로 생성하는 간단한 웹앱 |
| **150km 라이딩 전략** | [myactivity](https://github.writeaday.click/application/myactivity/150km.html) | 장거리 라이딩을 구간별로 나누어 페이스와 운영 전략을 확인하는 페이지 |

---

## 주요 프로젝트

### GPX Studio

GPX 파일을 서버에 업로드하지 않고 브라우저 안에서 직접 편집하는 도구입니다.

주요 기능:

- 기록 앞뒤의 불필요한 구간 자르기
- 잘못된 길이나 GPS 튐 구간 삭제
- 삭제 예정 구간 지도 미리보기
- 날짜 기준 트랙 분할
- 웨이포인트 추가·수정·삭제
- Undo / Redo
- 표준 GPX 1.1 다운로드
- 원본 GPX 파일 유지
- 브라우저 로컬 처리

실행:

https://github.writeaday.click/application/gpx-edit/

---

### MovEdit

브라우저에서 동영상, 이미지, 자막을 타임라인에 배치하고 MP4로 렌더링하는 비파괴 방식의 간단한 영상 편집기입니다.

주요 기능:

- 16:9 / 9:16 Canvas
- 720p / 1080p 출력
- 영상·이미지 Drag & Drop
- Timeline 이동 / Trim / Split
- Clip Snap
- VIDEO / AUDIO 자동 분리
- 이미지 및 영상 Overlay
- Canvas 경계 Snap
- Overlay 이동 및 크기 조절
- 자막 입력 및 스타일 편집
- Fade / Cross Fade / Slide / Wipe
- Undo / Redo
- 프로젝트 JSON 저장·불러오기
- ffmpeg.wasm 기반 MP4 Render
- 브라우저 내부 미디어 처리

실행:

https://github.writeaday.click/application/movedit/

MovEdit은 개발 소스와 배포 파일을 분리해서 관리합니다.

```text
movedit/
├── source/        # 개발 원본
├── bundle/        # Vite 빌드 결과
├── index.html     # GitHub Pages 진입점
├── package.json
├── vite.config.js
└── README.md
```

`movedit/source/**`가 변경되면 GitHub Actions가 Vite Build를 실행하고 배포용 파일을 자동으로 갱신합니다.

---

### HTML Edit

HTML 파일을 브라우저에서 불러와 소스코드를 직접 수정하지 않고 화면 요소를 선택하면서 수정하는 비주얼 HTML 편집기입니다.

주요 기능:

- 로컬 HTML 파일 열기
- 화면 요소 클릭 선택
- 텍스트 더블클릭 직접 편집
- Section / Container / Heading / Paragraph / Link / Button / Image / List / Divider / Card 추가
- ID / Class / href / src / alt 수정
- 크기·간격·글자·색상·테두리 스타일 편집
- 이미지 파일 Data URL 삽입
- 요소 복제 / 이동 / 삭제
- Undo / Redo
- Desktop / Tablet / Mobile 미리보기
- 수정 HTML 다운로드
- 브라우저 로컬 처리

실행:

https://github.writeaday.click/application/htmledit/

---

### Magic QR Tree

입력한 URL을 QR 코드로 생성하고, QR 패턴을 3D 지형과 나무 형태로 표현하는 인터랙티브 WebGL 애플리케이션입니다.

주요 기능:

- URL 기반 QR 코드 생성
- QR 패턴을 이용한 3D 지형 생성
- 3D 나무와 장식 요소 렌더링
- Spring / Summer / Autumn 계절 테마
- 마우스 Drag 회전 및 Scroll Zoom
- QR 스캔 전용 Top View
- 현재 URL과 계절 상태를 Query String으로 공유
- 공유 링크 클립보드 복사
- Three.js / WebGL 기반 브라우저 렌더링

실행:

https://github.writeaday.click/application/magic-qr-tree/

---

## 저장소 구조

```text
application/
├── .github/
│   └── workflows/
├── adguard/
├── bicycle_transport/
├── bike/
├── convert/
├── dice/
├── gpx-edit/
├── gpxnavi/
├── htmledit/
├── lotto/
├── magic-qr-tree/
├── mindmap/
├── movedit/
├── myactivity/
├── sejonglaunch/
├── toss/
├── index.html
└── README.md
```

### 웹 앱이 아닌 폴더

#### adguard

AdGuard 관련 설정 파일을 보관하는 디렉터리입니다.

현재 웹 애플리케이션이 아니므로 Application Launcher에는 표시하지 않습니다.

#### toss

Toss Invest 관련 Python/MCP 실험 코드를 보관하는 디렉터리입니다.

현재 GitHub Pages에서 실행하는 웹 애플리케이션이 아니므로 Application Launcher에는 표시하지 않습니다.

---

## 배포

이 저장소의 기본 웹 진입점은 다음과 같습니다.

```text
https://github.writeaday.click/application/
```

각 앱은 저장소 하위 디렉터리와 URL 경로를 동일하게 유지하는 것을 기본 원칙으로 합니다.

예:

```text
gpx-edit/  → /application/gpx-edit/
movedit/   → /application/movedit/
bike/      → /application/bike/
mindmap/   → /application/mindmap/
```

대부분의 단일 HTML/JavaScript 앱은 GitHub Pages에서 그대로 서비스됩니다.

빌드 과정이 필요한 프로젝트는 해당 프로젝트 폴더에서 별도의 Build Workflow를 사용합니다.

---

## 프로젝트 추가 원칙

새로운 웹 앱을 추가할 때는 다음 구조를 권장합니다.

```text
application/
└── new-app/
    ├── index.html
    ├── css/
    ├── js/
    ├── assets/
    └── README.md
```

앱을 추가한 뒤에는 다음 두 곳도 함께 수정합니다.

1. 루트 `index.html`의 Application Launcher
2. 루트 `README.md`의 Apps & Tools 목록

---

## 개발 방향

이 저장소의 프로젝트는 다음 원칙을 지향합니다.

- 설치 없이 바로 사용할 수 있는 웹 도구
- 한 가지 목적을 명확하게 수행하는 작은 애플리케이션
- 가능한 경우 브라우저 로컬 처리 우선
- 모바일과 데스크톱 모두 사용할 수 있는 반응형 UI
- 원본 파일을 직접 변경하지 않는 비파괴 처리
- 프로젝트별 독립 실행 구조
- GitHub Pages에서 손쉽게 배포 가능한 구성

---

## Repository

GitHub:

https://github.com/mycodehive/application

Launcher:

https://github.writeaday.click/application/
