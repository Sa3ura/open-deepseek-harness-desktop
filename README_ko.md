# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | 한국어 | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop은 커뮤니티가 독립적으로 관리하는 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 데스크톱 배포판입니다. 플러그인 기반 에이전트 런타임과 호환 API, 사용자 지정 모델, 워크스페이스, 세션, 플러그인 및 Skill을 관리하는 시각적 작업 공간을 결합합니다.

이 프로젝트는 DeepSeek의 공식 제품이 아니며 [MIT License](LICENSE)로 배포됩니다. 현재 개발자 프리뷰 단계입니다.

## 주요 기능

- 시작 안내 또는 설정에서 DeepSeek 및 호환 API URL, 키 참조, 모델 ID를 구성할 수 있습니다.
- 영구 세션, 메시지 복사와 삭제, 대화 기록 비우기, 주요 실행 단계 요약을 지원합니다.
- 제한된 원클릭 플러그인 설치, Skill, 테마 및 로컬 채팅 배경을 제공합니다.
- 데스크톱 소스 실행은 macOS에서 우선 검증되었습니다. Windows 및 Linux 설치 프로그램은 아직 패키징과 네이티브 검증이 필요합니다.

## 소스에서 실행

Node.js `^22.19.0 || >=24.0.0`와 pnpm `11.7.0`을 설치한 후 실행하세요.

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

전체 기능, 아키텍처, 보안 및 플랫폼 상태는 [English README](README.md) 또는[중국어 간체 README](README.zh.md)를 참고하세요. [데스크톱 참고 문서](apps/desktop/README.md)와[사용자 가이드](docs/user/guide/index.md)도 제공됩니다.

## FLAQ.AI 소개

[FLAQ.AI](https://flaq.ai/)는 이미지, 비디오, 오디오 및 언어 모델을 API, 문서와 개발자 워크플로로 제공합니다. 이 프로젝트 실행에 필수인 서비스는 아닙니다. 사용하기 전에 [FLAQ.AI 문서](https://flaq.ai/docs/)에서 현재 지원 범위, 가격 및 데이터 처리 조건을 확인하세요.

## 라이선스

이 프로젝트는 [MIT License](LICENSE)로 제공됩니다.
