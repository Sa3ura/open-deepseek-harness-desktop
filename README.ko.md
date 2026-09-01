<p align="center"><img src="./apps/desktop/src/icon.png" width="112" alt="Open DeepSeek Harness Desktop 아이콘"></p>

# Open DeepSeek Harness Desktop

<p align="center"><strong>바로 사용할 수 있고 의존성 안전성을 강화한 DeepSeek Harness 커뮤니티 데스크톱 버전</strong></p>

언어: [简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · 한국어 · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

> [!IMPORTANT]
>
> **[v0.1.2-alpha.1.1이 출시되었습니다. v0.1.2-alpha.1의 수정·강화 버전이니 다운로드해 사용해 보세요](https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.1.2-alpha.1.1).** 이 릴리스는 DeepSeek Harness 0.1.2-alpha.1을 계속 업스트림 기준으로 사용하면서 데스크톱 환경 관리, 플러그인 복구, 크로스 플랫폼 안정성을 강화합니다.
>
> 이 버전은 Alpha 프리릴리스입니다. 업그레이드 전에 중요한 설정을 백업하고, 문제를 보고할 때 관련 로그나 진단 보고서를 첨부해 주세요.

Open DeepSeek Harness Desktop는 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)를 기반으로 하는 독립적인 커뮤니티 배포판입니다. 설치 프로그램에 Node.js, pnpm, Harness 런타임이 포함되어 모델 설정, 코딩 세션, 실행 기록, 플러그인과 Skill, 외부 코딩 도구 및 IM 봇을 별도 개발 환경 없이 사용할 수 있습니다.

> [!NOTE]
>
> 이 저장소는 DeepSeek의 공식 제품이 아닙니다. 현재 프리뷰 단계이므로 데이터 형식, 플러그인 호환 정책, 설치 방식이 계속 변경될 수 있습니다.

## 이번 릴리스의 주요 기능

- 공식 설정을 독립 환경으로 가져오기, 기존 디렉터리 직접 공유, 완전히 새로 시작하기.
- 온라인 출처 확인과 소스 디렉터리 또는 .tgz를 이용한 안전한 플러그인 복원.
- pnpm, Cordis 다중 인스턴스, Loader 잔여 항목과 유령 플러그인을 시작 전에 진단·복구·격리.
- 선택한 텍스트 복사, 새 대화에서 질문, 현재 초안에 추가.
- 트레이, 빠른 재시작, 알림, 로그, 앱 내 업데이트, dsh 명령 등록.
- Windows x64, macOS arm64/x64, Linux DEB/RPM 패키지.

## 첫 실행과 독립 데이터 환경

처음 실행할 때 기본 공식 DSH 디렉터리 ~/.dsh를 확인합니다. 디렉터리가 없거나 지원되지 않아도 다른 지원 디렉터리를 직접 선택하거나 빈 데스크톱 전용 환경을 만들 수 있습니다.

### 독립 환경으로 가져오기

설정, 자격 증명, 세션, 작업 공간 정보, Agent 프리셋, Skill, 연결 상태를 데스크톱 전용 디렉터리로 복사하며 원본은 변경하지 않습니다. Profile, node_modules, 잠금 파일, 플러그인 런타임, 격리·상태 기록, 익명 식별자는 복사하지 않습니다. 플러그인은 데스크톱 Profile에 다시 설치되며 이후 공식 CLI/Web과 독립적으로 변경됩니다.

<p align="center"><img src="./assets/readme/data-home-import-en.png" width="900" alt="공식 DSH 설정을 독립 데스크톱 환경으로 가져오기"><br><sub>지원 데이터만 복사하고 원본 환경은 유지합니다</sub></p>

### 이 설정을 직접 사용

공식 ~/.dsh 또는 직접 선택한 지원 디렉터리를 복사 없이 사용합니다. 설정, 자격 증명, 세션, Agent 프리셋, Skill, Profile, 플러그인이 공유되며 Desktop과 공식 CLI/Web의 변경은 같은 데이터에 반영됩니다.

<p align="center"><img src="./assets/readme/data-home-reuse-en.png" width="900" alt="기존 DSH 설정을 데스크톱에서 직접 사용"><br><sub>선택한 디렉터리와 모든 지원 데이터를 공유합니다</sub></p>

### 새로 시작

기존 설정, 세션, 플러그인을 읽지 않고 완전히 독립적인 빈 환경을 만듭니다.

<p align="center"><img src="./assets/readme/data-home-fresh-en.png" width="900" alt="새로운 독립 DSH 환경 만들기"><br><sub>기존 DSH 설정을 읽거나 변경하지 않습니다</sub></p>

진입 후 설정 마법사에서 모델 API Key, WeChat·Feishu 등 IM 봇, 선택적인 Codex 연결을 구성할 수 있습니다. 모든 단계는 건너뛰고 나중에 설정에서 완료할 수 있습니다.

## 가져온 플러그인 선택과 복원

독립 환경 가져오기는 플러그인 설정과 복원 목록만 복사하고 이전 node_modules는 사용하지 않습니다. 복원 화면은 다음 출처 상태를 표시합니다.

- **클라이언트 제공**: 번들 프리셋이 이미 충족합니다.
- **확인 중**: 활성 Profile을 변경하지 않고 임시 디렉터리에서 출처를 검사합니다.
- **온라인 복원 가능**: 내장 pnpm으로 다시 설치할 수 있습니다.
- **온라인 출처 없음**: 패키지, 저장소 또는 Git 참조가 존재하지 않습니다.
- **일시적으로 확인 불가**: 오프라인, 시간 초과, 인증 실패 또는 속도 제한으로 나중에 재시도할 수 있습니다.

온라인 출처를 사용할 수 없으면 사용자가 소스 디렉터리나 .tgz를 선택할 수 있습니다. 클라이언트는 패키지 이름, 아카이브 경로, manifest 크기와 전체 크기를 검증하고, 소스 디렉터리는 수명 주기 스크립트를 비활성화한 채 다시 패키징합니다. 모든 복원은 빌드 승인, 공유 의존성 진단, 필요한 격리를 거칩니다. 기존 node_modules나 자격 증명이 포함된 알 수 없는 주소를 직접 실행하지 않습니다.

<p align="center"><img src="./assets/readme/imported-plugin-restore-zh.png" width="900" alt="가져온 플러그인의 온라인 출처 확인과 로컬 복원"><br><sub>출처 상태, 온라인 복원, 안전한 로컬 복원</sub></p>

## 강화된 진단 검사

타사 플러그인은 Host와 같은 Node.js 프로세스 및 Cordis 서비스 그래프를 공유합니다. 전이 의존성, pnpm 링크 방식, 오래된 Loader 항목만으로도 설정이 열리기 전에 빈 도구 호출, .prepare 오류, 사라진 플러그인 목록이 발생할 수 있습니다.

따라서 진단은 일반 플러그인이 아니라 Profile 구성과 부팅 계층에서 실행됩니다. 타사 코드보다 먼저 manifest, pnpm-lock.yaml, Workspace 설정, Bundle 순서, 실제 설치 그래프와 현재 설치본의 공유 런타임을 읽습니다.

Cordis Context, Service, Symbol은 버전 번호뿐 아니라 물리 모듈의 정체성에 의존합니다. 같은 버전이라도 다른 real path에 설치된 @deepseek-ai/cordis 또는 dsh-tools는 서로 다른 JavaScript 인스턴스입니다. 검사는 각 루트 플러그인에서 직접·간접 의존성, 선언 범위, 최종 경로를 추적합니다. 올바른 peerDependencies는 오탐하지 않습니다.

검사 범위에는 공유 Host 싱글턴, Profile·잠금 파일 일관성, 고아·중복 Bundle, 유령 플러그인, pnpm Store, 불완전한 설치, allowBuilds, prepare 승인, peer 중복 제거 설정이 포함됩니다.

복구 순서는 **읽기 전용 검사 → 무손실 수렴 → 필요한 의존성만 설치 → real path 재검사 → 필요 시 격리**입니다. 정상 Profile에서는 pnpm을 실행하지 않습니다. 호환되는 경우 관리형 link: override를 사용하지만 minimumReleaseAge나 명시적인 allowBuilds: false를 완화하지 않습니다. pnpm이 성공해도 물리 경로와 Loader 상태가 재검사를 통과해야 시작합니다.

안전하게 통합할 수 없으면 원인이 된 루트 플러그인만 활성 의존성과 Bundle 순서에서 제거하고 원래 사양, 버전, 의존 경로, 이유와 시간을 보존합니다. 패키지가 실제 Profile에서 빠지고 공유 Host가 표준 복사본을 가리키며 재검사가 성공해야 격리가 완료됩니다. 즉, 이해하기 어려운 스택을 “누가, 왜 실패했고, 어떤 보호를 적용했으며, 다음에 무엇을 할지”로 바꿉니다.

## 텍스트 선택과 오른쪽 클릭 메뉴

대화, 도구 출력, 세부 정보, 파일 미리보기의 읽기 전용 텍스트를 선택하면 가로 작업 표시줄이 나타나며, 선택 영역을 오른쪽 클릭하면 세로형 둥근 메뉴가 나타납니다.

- **복사**: 선택 내용을 시스템 클립보드에 저장합니다.
- **새 대화에서 질문**: 현재 작업 공간에 새 대화를 만들고 내용을 채우지만 자동 전송하지 않습니다.
- **현재 대화에 추가**: 기존 초안을 덮어쓰지 않고 Markdown 인용문으로 추가합니다.

현재 세션이 선택·확인·답변을 기다리거나 입력창이 비활성화되면 “현재 대화에 추가”는 자동으로 숨겨집니다.

<p align="center">
  <strong>선택 작업 표시줄</strong><br>
  <img src="./assets/readme/selection-toolbar-zh.png" width="900" alt="텍스트 선택 후 가로 작업 표시줄">
</p>

<p align="center">
  <strong>오른쪽 클릭 메뉴</strong><br>
  <img src="./assets/readme/selection-context-menu-zh.png" width="900" alt="선택 텍스트의 세로 오른쪽 클릭 메뉴">
</p>

## 데스크톱 경험

- 트레이 실행과 완전 종료, macOS 메뉴 막대 및 Windows/Linux 트레이의 빠른 재시작.
- 시작 실패·복구 알림, 고정 Harness 로그 위치, 15초 이상 대기 시 로그 열기.
- 일반 설정에서 Release 확인, 다운로드 진행률, SHA256SUMS 검증, 설치 프로그램 열기.
- 내장 dsh 명령을 시스템 PATH에 안전하게 등록하거나 제거.
- Windows/Linux 사용자 지정 제목 표시줄, macOS 기본 동작, 제한된 클립보드 쓰기.
- 로컬 검증 아카이브로 Plugin Marketplace, dsh-im, dsh-skill-picker, dsh-font, Better Sidebar, dsh-pocket 제공. 사용자가 제거하면 자동 복구하지 않습니다.
- Codex와 Claude Code는 번들에서 제외되며 설정 → 외부 도구에서 필요한 공식 패키지만 온라인 설치합니다.

## 테마와 배경

시스템, 라이트, 다크 및 8개 제품 테마, 8개 내장 일러스트, 로컬 PNG/JPEG/WebP 배경을 지원합니다. 사용자 이미지는 로컬 브라우저 저장소에만 보관되고 모델로 전송되지 않습니다.

<table><tr><th width="50%">테마</th><th width="50%">배경</th></tr><tr><td align="center"><img src="./assets/readme/theme-settings-en.png" alt="테마 설정"></td><td align="center"><img src="./assets/readme/background-settings-en.png" alt="배경 설정"></td></tr></table>

## 다운로드 및 설치

[GitHub Releases](https://github.com/flaqai/open-deepseek-harness-desktop/releases)에서 운영체제에 맞는 파일을 다운로드하세요.

| 운영체제 | 아키텍처 | 패키지 |
| --- | --- | --- |
| macOS | Apple Silicon arm64 | DeepSeek-Harness-macos-arm64.dmg |
| macOS | Intel x64 | DeepSeek-Harness-macos-x64.dmg |
| Windows | x64 | DeepSeek-Harness-windows-x64.exe |
| Linux | Debian / Ubuntu x64 | DeepSeek-Harness-linux-x64.deb |
| Linux | Fedora / RHEL x64 | DeepSeek-Harness-linux-x64.rpm |

SHA256SUMS로 다운로드를 검증하세요. macOS 빌드는 ad-hoc 서명이고 공증되지 않았습니다. 차단되면 “시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기”를 사용하세요. Windows에서는 서명되지 않았거나 새로 게시된 앱에 평판 경고가 나타날 수 있습니다.

## 소스에서 실행

Node.js ^22.19.0 또는 24 이상과 pnpm 11.7.0을 설치한 뒤 다음을 실행합니다.

    git clone https://github.com/flaqai/open-deepseek-harness-desktop.git
    cd open-deepseek-harness-desktop
    pnpm install
    pnpm run build
    pnpm run dev:desktop

Web만 실행하려면 pnpm dsh web을 사용합니다. 소스 Web은 현재 DSH_HOME(미설정 시 일반적으로 ~/.dsh)을 사용하며 설치형 Desktop은 첫 실행에서 선택한 디렉터리를 사용합니다.

## 보안, 커뮤니티 및 라이선스

Renderer는 Node 통합을 비활성화하고 context isolation과 Chromium sandbox를 활성화합니다. 탐색은 정확한 Harness loopback origin으로 제한되며 임의 명령, 파일 또는 URL을 위한 범용 bridge를 제공하지 않습니다. API Key는 Harness 자격 증명 서비스를 사용하세요.

- [사용자 가이드](docs/user/guide/index.md), [플러그인 가이드](docs/user/develop/framework/index.md), [Skill 가이드](docs/subsystems/skills.md)
- 버그 및 제안: [GitHub Issues](https://github.com/flaqai/open-deepseek-harness-desktop/issues)
- 업스트림: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

Open DeepSeek Harness Desktop는 [MIT License](LICENSE)로 제공됩니다. 타사 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.

## Friends

- [DSHFind](https://dshfind.com/zh) — DeepSeek Harness 중국어 학습 및 공유 커뮤니티.
