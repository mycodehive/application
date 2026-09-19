# Font Assets

MovEdit 저장소에는 폰트 바이너리를 포함하지 않습니다.

현재 자막 Render는 브라우저 Canvas에서 자막 레이어를 래스터 이미지로 생성한 뒤 FFmpeg overlay로 합성합니다.

특정 한글 폰트를 프로젝트에 고정하려면 해당 폰트의 재배포 라이선스를 먼저 확인한 뒤 이 폴더에 배치하고, 앱 시작 시 FontFace API로 로드하도록 연결하세요.
