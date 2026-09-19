# MovEdit

브라우저에서 가볍게 사용하는 비파괴 방식의 Simple Video Editor입니다.

## 빠른 사용법

1. 영상 가져오기
2. Timeline에 배치
3. 영상 자르기
4. 이미지/자막 삽입
5. Transition 적용
6. Preview
7. Render
8. MP4 저장

MovEdit의 핵심 목표는 기능 수를 늘리는 것이 아니라 **영상 가져오기 → 편집 → 미리보기 → 렌더링** 흐름을 안정적으로 연결하는 것입니다.

## 구현 기능

- MP4, WebM, MOV 등 브라우저/FFmpeg가 처리 가능한 영상 가져오기
- JPG, JPEG, PNG, WebP 이미지 가져오기
- Drag & Drop 미디어 가져오기
- 브라우저 로컬 파일 처리 (URL.createObjectURL) — 서버 업로드 없음
- 비파괴 편집 (sourceIn, sourceOut)
- VIDEO 1 / VIDEO 2·OVERLAY / IMAGE / SUBTITLE / AUDIO 트랙
- Playhead 이동 및 Preview 동기화
- Clip Drag 이동
- Clip 양쪽 Handle Trim
- Playhead 위치 Split
- 여러 영상 순차 편집
- 이미지 Overlay 위치 이동 / Resize
- Video Picture-in-Picture Overlay
- Overlay opacity / volume
- Transition: None, Fade, Cross Fade, Slide Left/Right, Wipe Left/Right
- Transition duration 사용자 입력
- 한글 자막 입력
- 자막 시작/종료, 크기, 색상, 배경, 배경 투명도, 위치 편집
- Undo / Redo
- Keyboard Shortcut
- 프로젝트 JSON Export / Import
- 720p / 1080p MP4 Render
- FFmpeg Lazy Load
- Render Progress / Cancel
- 오디오가 없는 메인 영상에 무음 Audio Track 보충
- FFmpeg 렌더링 결과 Preview 및 MP4 다운로드

## 기술 스택

- HTML5
- CSS3
- Vanilla JavaScript ES Modules
- HTML5 Video
- Canvas API
- Vite
- ffmpeg.wasm

확인한 패키지 버전:

- @ffmpeg/ffmpeg: 0.12.15
- @ffmpeg/util: 0.12.2
- @ffmpeg/core: 0.12.10
- @ffmpeg/core-mt: 0.12.10

## 실행 방법

Node.js가 설치된 환경에서:

~~~bash
cd movedit
npm install
npm run dev
~~~

개발 서버 주소로 접속한 뒤 영상/이미지를 가져옵니다.

## 빌드

~~~bash
npm run build
~~~

빌드 결과는 dist/에 생성됩니다.

~~~bash
npm run preview
~~~

으로 배포 결과를 로컬에서 확인할 수 있습니다.

## 배포

dist/의 내용을 정적 웹 서버에 배포할 수 있습니다.

이 프로젝트는 base: "./"를 사용하므로 /application/movedit/ 같은 하위 경로에도 배포할 수 있도록 구성했습니다.

### FFmpeg Core 배포

@ffmpeg/ffmpeg 패키지 자체는 Vite가 번들합니다. FFmpeg Core는 최초 Render 시 Lazy Load 합니다.

기본 개발 설정은 @ffmpeg/core 또는 @ffmpeg/core-mt의 0.12.10 core 파일을 jsDelivr에서 읽습니다. 운영 환경에서는 외부 CDN 의존을 줄이기 위해 core 파일을 자체 서버에 배치하는 것을 권장합니다.

예:

~~~text
/application/movedit/ffmpeg/
├── ffmpeg-core.js
├── ffmpeg-core.wasm
└── ffmpeg-core.worker.js   # multi-thread 사용 시
~~~

빌드 시 환경변수를 지정합니다.

~~~bash
VITE_FFMPEG_CORE_BASE=/application/movedit/ffmpeg npm run build
~~~

Windows PowerShell:

~~~powershell
$env:VITE_FFMPEG_CORE_BASE="/application/movedit/ffmpeg"
npm run build
~~~

## COOP / COEP

Multi-thread FFmpeg Core는 SharedArrayBuffer와 Cross-Origin Isolation이 필요합니다.

권장 HTTP Header:

~~~text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
~~~

Nginx 예:

~~~nginx
location /application/movedit/ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    try_files $uri $uri/ /application/movedit/index.html;
}
~~~

crossOriginIsolated === true이고 SharedArrayBuffer가 사용 가능하면 multi-thread core를 선택하고, 그렇지 않으면 single-thread core로 fallback합니다.

GitHub Pages는 임의의 COOP/COEP 응답 Header 설정이 어렵기 때문에 일반적으로 single-thread fallback으로 동작하는 것을 전제로 합니다.

## Project State

원본 파일과 편집 정보는 분리합니다.

주요 구조:

~~~text
Project
├── resolution
├── fps
├── duration
├── assets
├── clips
├── subtitles
└── transitions
~~~

Clip은 원본 영상을 실제로 계속 잘라 새 파일을 만드는 대신 다음 정보를 저장합니다.

~~~text
assetId
timelineStart
duration
sourceIn
sourceOut
track
x / y
width / height
opacity
volume
~~~

Preview와 Render는 동일한 Project State를 참조합니다.

## Keyboard Shortcut

| Shortcut | 기능 |
|---|---|
| Space | Play / Pause |
| Delete / Backspace | 선택 Clip / Subtitle 삭제 |
| S | Playhead 위치 Split |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + S | 프로젝트 JSON 저장 |

입력창, 자막 textarea, select에 포커스가 있을 때는 일반 S, Delete, Space 단축키가 입력을 방해하지 않습니다.

## 렌더링 구조

UI Event Handler에서 FFmpeg 명령을 직접 만들지 않습니다.

- js/renderer.js
  - buildRenderPlan()
  - 미디어 준비
  - 메인 영상 정규화
  - Transition Filter Graph 생성
  - Image / Video Overlay
  - Subtitle Overlay
  - 최종 MP4 생성
- js/ffmpeg-service.js
  - FFmpeg Lazy Load
  - Core 선택
  - Virtual FS
  - Progress
  - Audio Stream 확인
  - Cancel / terminate

메인 영상은 프로젝트 출력 해상도와 FPS로 먼저 normalize한 뒤 최종 Filter Graph에 사용합니다.

Audio Stream이 없는 영상에는 무음 stereo track을 생성하여 Audio 유무가 섞인 프로젝트에서도 렌더링 파이프라인이 깨지지 않도록 구성했습니다.

## 자막

Preview와 Render의 자막 모양 차이를 줄이기 위해 최종 렌더링에서도 브라우저 Canvas로 자막 레이어를 만들어 투명 PNG Overlay로 FFmpeg에 전달합니다.

이 방식은 FFmpeg의 libass/font 설치 상태에 대한 의존도를 낮춥니다.

현재 저장소에는 폰트 파일을 포함하지 않습니다. 특정 한글 폰트를 항상 동일하게 사용해야 한다면 라이선스가 명확한 폰트를 프로젝트에서 별도 제공하고 FontFace로 로드하도록 확장하는 것을 권장합니다.

## 메모리 관리

- Media 원본 파일은 Project History에 복사하지 않습니다.
- Project JSON에도 영상 원본을 저장하지 않습니다.
- 원본은 브라우저 File 객체와 Object URL로 참조합니다.
- 500MB 이상 파일은 경고를 표시합니다.
- 4K 미디어에는 1080p 출력 권장 메시지를 표시합니다.
- Preview용 썸네일은 미디어당 1개만 생성합니다.

## 지원 브라우저

권장:

- Chrome 최신 안정 버전
- Edge 최신 안정 버전

Safari / Firefox는 코덱, WebAssembly 메모리, SharedArrayBuffer 정책 차이로 일부 파일 또는 렌더링이 제한될 수 있습니다.

## 알려진 제한사항

- 브라우저가 직접 디코딩하지 못하는 코덱은 FFmpeg가 읽을 수 있어도 Preview가 불가능할 수 있습니다.
- 대용량·장시간 영상은 브라우저 메모리 제한 때문에 실패하거나 매우 느릴 수 있습니다.
- 4K 출력은 MVP 범위에서 제외합니다.
- 전문 NLE의 Keyframe, 색보정, Chroma Key, Tracking, Audio Mixer 기능은 포함하지 않습니다.
- Project JSON에는 원본 미디어가 포함되지 않으므로 다시 열 때 같은 파일을 재연결해야 합니다.
- Transition이 있는 VIDEO 1은 연속 배치된 Clip을 기본 사용 시나리오로 합니다.
- Preview의 Slide/Wipe 전환은 MVP에서 최종 FFmpeg 렌더링보다 단순하게 보일 수 있습니다.
- 외부 CDN을 기본 FFmpeg Core 경로로 사용하는 개발 설정은 인터넷 연결이 필요합니다. 운영 배포에서는 자체 호스팅을 권장합니다.
- 렌더링 진행률은 ffmpeg.wasm progress 이벤트가 의미 있는 값을 제공하지 못하는 단계에서 "처리 중"으로 표시합니다.

## 오류 처리

다음 오류는 Toast / Render Modal과 Console 상세 로그로 처리하도록 구성했습니다.

- 지원하지 않는 Video Codec
- Video Metadata Load 실패
- FFmpeg Load 실패
- FFmpeg Render 실패
- 미디어 재연결 필요
- 잘못된 렌더링 상태
- 렌더링 취소
- Audio 없는 Video

## 테스트

TESTING.md에 MVP 필수 시나리오 체크리스트를 분리했습니다.

브라우저 영상 렌더링은 실제 미디어/브라우저/메모리 조건에 따라 달라지므로 배포 전 대상 브라우저에서 테스트 파일로 확인해야 합니다.
