# HTML Edit

HTML 파일을 브라우저에서 불러와 소스코드를 직접 수정하지 않고 화면 요소를 클릭하면서 편집하는 비주얼 HTML 편집기입니다.

## 실행

https://github.writeaday.click/application/htmledit/

## 주요 기능

- 로컬 HTML 파일 열기
- iframe 기반 실시간 화면 미리보기
- 요소 클릭 선택
- 텍스트 요소 더블클릭 직접 편집
- Section / Container / Heading / Paragraph / Link / Button / Image / List / Divider / Card 추가
- 선택 요소의 안쪽 또는 뒤쪽에 새 요소 삽입
- ID / Class / href / src / alt 수정
- Width / Height / Margin / Padding 편집
- Font Size / Weight / Color / Background / Align 편집
- Border / Radius 편집
- Inline Style 직접 편집
- 이미지 파일을 Data URL로 HTML 내부에 삽입
- 요소 복제 / 위로 이동 / 아래로 이동 / 삭제
- Undo / Redo
- Desktop / Tablet / Mobile 미리보기
- 수정된 HTML 파일 다운로드

## 보안 및 동작 방식

불러온 HTML은 브라우저의 `iframe srcdoc` 안에서 표시됩니다.

편집 중에는 업로드한 HTML 내부의 JavaScript 실행을 허용하지 않습니다. 원본의 `script` 태그는 HTML 안에 유지되지만 편집 화면에서는 실행되지 않습니다.

모든 작업은 브라우저 내부에서 처리되며 HTML 파일을 서버에 업로드하지 않습니다.

## 참고

HTML 파일이 상대경로 CSS, JavaScript, 이미지 등에 의존하는 경우 브라우저에서 단일 HTML 파일만 불러왔을 때 해당 리소스가 보이지 않을 수 있습니다. 독립 실행형 HTML 또는 절대 URL 리소스를 사용하는 문서에서 가장 안정적으로 사용할 수 있습니다.
