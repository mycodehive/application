# MovEdit Test Checklist

## 정적 구조 확인

- [ ] npm install
- [ ] npm run dev
- [ ] Editor Layout 정상 표시
- [ ] Console 초기 오류 없음
- [ ] FFmpeg는 페이지 진입 즉시 다운로드되지 않음

## 필수 시나리오

- [ ] 영상 1개 Import → Trim → Render
- [ ] 영상 2개 → 이어붙이기 → Render
- [ ] 영상 2개 → Cross Fade → Render
- [ ] 영상 + PNG → Overlay → Render
- [ ] 영상 + 한글 자막 → Render
- [ ] 영상 + 여러 자막 → Render
- [ ] Audio 없는 영상 → Render
- [ ] 720p + 1080p 영상 혼합 → 1080p Render
- [ ] Render Cancel
- [ ] Undo / Redo

## Preview / Render 비교

- [ ] 영상 순서
- [ ] Clip 시작/종료 시간
- [ ] 이미지 위치와 크기
- [ ] Overlay opacity
- [ ] 자막 시작/종료 시간
- [ ] 자막 글자 크기
- [ ] 자막 글자색
- [ ] 자막 배경색 / 투명도
- [ ] Transition 종류와 길이
- [ ] Audio 유무 및 volume

## Project

- [ ] Project JSON Export
- [ ] Project JSON Import
- [ ] Import 후 원본 파일 재연결 안내
- [ ] 동일 파일명 재가져오기 시 기존 Asset에 재연결

## Keyboard

- [ ] Space Play/Pause
- [ ] Delete 선택 삭제
- [ ] S Split
- [ ] Ctrl/Cmd+Z Undo
- [ ] Ctrl/Cmd+Shift+Z Redo
- [ ] Ctrl/Cmd+S Project 저장
- [ ] Input/Textarea Focus 중 일반 단축키가 입력을 방해하지 않음

## Performance

- [ ] 500MB 초과 파일 경고
- [ ] 4K 미디어 1080p 권장 경고
- [ ] 장시간 Preview 후 Object URL / Video element 누수 확인
- [ ] 렌더링 취소 후 다시 Render 가능

## 환경별

### Single-thread
- [ ] crossOriginIsolated === false
- [ ] @ffmpeg/core 로드
- [ ] Render 성공

### Multi-thread
- [ ] COOP/COEP Header 적용
- [ ] crossOriginIsolated === true
- [ ] SharedArrayBuffer 사용 가능
- [ ] @ffmpeg/core-mt 로드
- [ ] Render 성공
