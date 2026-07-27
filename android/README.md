# Tradule Android (TWA)

이 폴더는 `www.tradule.co.kr`을 감싸는 Android [Trusted Web
Activity](https://developer.chrome.com/docs/android/trusted-web-activity/)
프로젝트예요. [Bubblewrap](https://github.com/GoogleChrome/bubblewrap)으로
생성했고, 실제 화면/로직은 전부 웹 앱(www.tradule.co.kr)이 그대로 그립니다 —
이 프로젝트는 그걸 플레이스토어에 올릴 수 있는 형태로 감싸는 얇은 껍데기예요.

## 왜 여기서 빌드가 안 끝났는가

이 프로젝트(twa-manifest.json, AndroidManifest.xml, 서명 키 등)는 샌드박스
안에서 생성했지만, 실제 APK/AAB를 만드는 `bubblewrap build`(=Gradle)는
`dl.google.com`(Android SDK/Gradle 플러그인 저장소)에 접근해야 하는데,
이 개발 환경의 네트워크 정책이 그 도메인을 막고 있어서 여기서는 빌드까지
끝낼 수 없었어요. 그래서 **실제 빌드는 GitHub Actions에서** 하도록
`.github/workflows/android-twa.yml`을 만들어뒀어요 (GitHub의 러너는 이런
제약이 없어요).

## 처음 한 번만: GitHub 시크릿 등록

빌드에 필요한 서명 키를 이 대화에서 파일로 받으셨을 거예요
(`android-signing-key.zip` 또는 채팅에 안내된 경로) — `android.keystore`
파일과 `keystore-passwords.txt`가 들어있어요.

**이 키는 절대 다시 만들 수 없어요.** 분실하면 지금 만든 앱(`kr.co.tradule.app`)
업데이트를 영원히 올릴 수 없고, 사실상 새 앱으로 처음부터 다시 심사받아야
해요. 비밀번호 관리자(1Password 등)에 keystore 파일 자체와 두 비밀번호를
반드시 백업해두세요.

1. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
   - `ANDROID_KEYSTORE_BASE64`: `base64 -w0 android.keystore` 실행 결과를 그대로 붙여넣기
   - `ANDROID_KEYSTORE_PASSWORD`: keystore-passwords.txt의 `KEYSTORE_PASSWORD` 값
   - `ANDROID_KEY_PASSWORD`: keystore-passwords.txt의 `KEY_PASSWORD` 값
2. Actions 탭 → "Android TWA build" 워크플로 → Run workflow 로 수동 실행
3. 완료되면 워크플로 실행 결과의 Artifacts에서 `tradule-android-release.zip`을
   받으면 그 안에 `app-release-bundle.aab`(플레이스토어 업로드용)와
   `app-release-signed.apk`(폰에 직접 설치해서 테스트용)가 들어있어요.

## Digital Asset Links (배포 필요)

`public/.well-known/assetlinks.json`을 웹 앱에 추가해뒀어요 — 이게
`https://www.tradule.co.kr/.well-known/assetlinks.json`으로 실제 배포되어야
Android가 "이 APK와 이 도메인이 같은 주인"이라고 신뢰하고 TWA를 주소창 없이
전체화면으로 띄워줍니다. **이 파일이 배포되기 전까지는 앱을 설치해도 위에
Chrome 주소창이 계속 보여요** (기능은 정상 동작하지만 앱처럼 안 보임).

## 로컬에서 직접 빌드하고 싶다면

Android Studio (또는 Android SDK + JDK 17)가 설치된 PC에서:

```bash
cd android
export BUBBLEWRAP_KEYSTORE_PASSWORD='...'  # keystore-passwords.txt 참고
export BUBBLEWRAP_KEY_PASSWORD='...'
npx @bubblewrap/cli build
```

첫 실행 시 JDK/Android SDK 경로를 물어보면 안내에 따라 답하면 됩니다.

## 플레이스토어에 올리기

1. [Google Play Console](https://play.google.com/console)에서 개발자 계정 등록
   (1회성 $25) — 사업자등록 여부에 따라 개인/조직 계정 중 선택
2. 새 앱 만들기 → `app-release-bundle.aab` 업로드
3. 스토어 등록정보 작성: 앱 설명, 스크린샷(폰 최소 2장), 아이콘(512x512, 이미
   `public/brand/`에 있음), 개인정보처리방침 URL(이미 있음:
   `https://www.tradule.co.kr/privacy`)
4. 콘텐츠 등급 설문, 데이터 안전성 섹션 작성 후 심사 제출

## 앱 업데이트할 때 (다음 릴리스부터)

`android/twa-manifest.json`의 `appVersionCode`를 올리고(예: 1 → 2), 워크플로를
다시 실행하면 됩니다. 웹 앱 쪽 UI가 바뀐 거라면 보통 이 Android 프로젝트는
안 건드려도 돼요 — TWA는 항상 최신 웹 페이지를 그대로 보여주니까요. 이
프로젝트를 다시 만져야 하는 경우는: 앱 이름/아이콘/테마색을 바꿀 때, 또는
`manifest.ts`(PWA manifest)의 구조 자체가 바뀌었을 때뿐이에요.

## 알림(푸시)

`enableNotifications: true`로 설정해뒀어요 — 이미 구현된 웹 푸시(VAPID)
알림이 TWA 안에서도 그대로 표시됩니다. 별도의 네이티브 FCM 연동은
필요 없어요 (Chrome의 notification delegation 기능).
