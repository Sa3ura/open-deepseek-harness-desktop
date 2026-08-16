# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | Deutsch | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop ist eine unabhängig von der Community gepflegte Desktop-Distribution von [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Sie verbindet die Plugin-basierte Agentenlaufzeit mit einer visuellen Arbeitsoberfläche für kompatible APIs, eigene Modelle, Workspaces, Sitzungen, Plugins und Skills.

Dieses Projekt ist kein offizielles DeepSeek-Produkt. Es steht unter der [MIT-Lizenz](LICENSE) und befindet sich derzeit in der Entwicklervorschau.

## Wichtigste Funktionen

- DeepSeek oder eine kompatible API mit Basis-URL, Schlüsselreferenz und Modell-IDs beim ersten Start oder in den Einstellungen konfigurieren.
- Dauerhafte Sitzungen verwalten, Nachrichten kopieren oder löschen, Verläufe leeren und wichtige Ausführungsschritte prüfen.
- Unterstützte Registry-Plugins kontrolliert mit einem Klick installieren sowie Skills, Farbschemata und lokale Chat-Hintergründe verwenden.
- Der Desktop-Start aus dem Quellcode wurde zuerst unter macOS geprüft. Installer für Windows und Linux benötigen noch Paketierung und native Validierung.

## Aus dem Quellcode starten

Installieren Sie Node.js `^22.19.0 || >=24.0.0` und pnpm `11.7.0` und führen Sie Folgendes aus:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Ausführliche Informationen zu Funktionen, Architektur, Sicherheit und Plattformstatus finden Sie in der [englischen README](README.md) oder der [chinesischen README](README.zh.md). Siehe auch die [Desktop-Referenz](apps/desktop/README.md) und das [Benutzerhandbuch](docs/user/guide/index.md).

## Über FLAQ.AI

[FLAQ.AI](https://flaq.ai/) stellt Bild-, Video-, Audio- und Sprachmodelle über APIs, Dokumentation und Entwickler-Workflows bereit. Der Dienst ist für dieses Projekt nicht erforderlich. Prüfen Sie vor der Nutzung die aktuellen Funktionen, Preise und Bedingungen zur Datenverarbeitung in der [FLAQ.AI-Dokumentation](https://flaq.ai/docs/).

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
