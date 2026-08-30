<p align="center"><img src="./apps/desktop/src/icon.png" width="112" alt="Open DeepSeek Harness Desktop Symbol"></p>

# Open DeepSeek Harness Desktop

<p align="center"><strong>Die sofort einsetzbare Community-Desktopausgabe von DeepSeek Harness mit verstärkter Abhängigkeitssicherheit</strong></p>

Sprachen: [简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · Deutsch · [Português](README.pt-BR.md)

> [!IMPORTANT]
>
> **[v0.1.2-alpha.1 ist verfügbar — jetzt herunterladen und ausprobieren](https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.1.2-alpha.1).** Die Version integriert DeepSeek Harness 0.1.2-alpha.1 und ergänzt das Diagnoselabor, die Live-Plugin-Suche, einen stärkeren Plugin-Isolationsschutz und eine frei sortierbare Einstellungsnavigation.
>
> Dies ist eine Alpha-Vorabversion. Sichern Sie wichtige Konfigurationen vor dem Upgrade und fügen Sie Problemmeldungen relevante Protokolle oder Diagnoseberichte bei.

Open DeepSeek Harness Desktop ist eine unabhängige, von der Community gepflegte Distribution von [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Die Installer enthalten Node.js, pnpm und die Harness-Laufzeit. Modelle, Coding-Sitzungen, Ausführungsspuren, Plugins, Skills, externe Coding-Werkzeuge und IM-Bots funktionieren daher ohne vorbereitete Entwicklungsumgebung.

> [!NOTE]
>
> Dieses Repository ist kein offizielles DeepSeek-Produkt. Es befindet sich weiterhin in der Vorschau; Datenformate, Kompatibilitätsregeln und Installation können sich noch ändern.

## Höhepunkte dieser Version

- Offizielle Konfiguration in eine unabhängige Umgebung importieren, ein vorhandenes Verzeichnis direkt teilen oder neu beginnen.
- Plugin-Quellen online prüfen und sicher aus einem Quellverzeichnis oder einer .tgz-Datei wiederherstellen.
- pnpm-Konflikte, doppelte Cordis-Instanzen, Loader-Reste und Geister-Plugins vor dem Start diagnostizieren, reparieren und isolieren.
- Markierten Text kopieren, in einer neuen Unterhaltung fragen oder an den aktuellen Entwurf anhängen.
- Tray, Schnellneustart, Benachrichtigungen, Protokolle, In-App-Update und Registrierung des dsh-Befehls.
- Pakete für Windows x64, macOS arm64/x64 und Linux DEB/RPM.

## Erster Start und unabhängige Datenumgebungen

Beim ersten Start prüft der Client das offizielle Standardverzeichnis ~/.dsh. Ist es nicht vorhanden oder nicht unterstützt, kann ein anderes kompatibles Verzeichnis gewählt oder eine leere Desktop-eigene Umgebung erstellt werden.

### In eine unabhängige Umgebung importieren

Einstellungen, Zugangsdaten, Sitzungen, Workspace-Informationen, Agent-Presets, Skills und Verbindungsstatus werden kopiert, ohne die Quelle zu verändern. Profiles, node_modules, Lockfiles, Plugin-Laufzeiten, Quarantäne- und Gesundheitsdaten sowie anonyme Kennungen werden nicht übernommen. Plugins werden im Desktop-Profile neu installiert; spätere Änderungen bleiben vom offiziellen CLI/Web getrennt.

<p align="center"><img src="./assets/readme/data-home-import-en.png" width="900" alt="Offizielle DSH-Konfiguration in eine unabhängige Umgebung importieren"><br><sub>Unterstützte Daten kopieren und die Quelle unverändert lassen</sub></p>

### Diese Konfiguration direkt verwenden

Verwendet ~/.dsh oder ein anderes kompatibles Verzeichnis ohne zweite Kopie. Einstellungen, Zugangsdaten, Sitzungen, Agent-Presets, Skills, Profiles und Plugins werden geteilt; Desktop und offizielles CLI/Web bearbeiten dieselben Daten.

<p align="center"><img src="./assets/readme/data-home-reuse-en.png" width="900" alt="Vorhandene DSH-Konfiguration direkt verwenden"><br><sub>Desktop teilt die Daten des ausgewählten Verzeichnisses</sub></p>

### Neu beginnen

Erstellt eine leere, unabhängige Umgebung, ohne bestehende Einstellungen, Sitzungen oder Plugins zu lesen oder zu importieren.

<p align="center"><img src="./assets/readme/data-home-fresh-en.png" width="900" alt="Leere unabhängige DSH-Umgebung erstellen"><br><sub>Keine bestehende DSH-Konfiguration wird gelesen oder geändert</sub></p>

Anschließend führt der Assistent durch Modell-API-Key, WeChat-/Feishu- und andere IM-Bots sowie eine optionale Codex-Verbindung. Jeder Schritt kann übersprungen und später in den Einstellungen abgeschlossen werden.

## Auswahl und Wiederherstellung importierter Plugins

Der unabhängige Import kopiert Plugin-Konfiguration und Wiederherstellungsliste, übernimmt aber nie das alte node_modules. Einträge erhalten die Zustände **vom Client bereitgestellt**, **wird geprüft**, **online verfügbar**, **Online-Quelle nicht verfügbar** oder **vorübergehend nicht prüfbar** bei Netzwerk-, Timeout-, Authentifizierungs- oder Rate-Limit-Problemen.

Fehlt eine Online-Quelle, kann der Benutzer ein Quellverzeichnis oder .tgz wählen. Der Client prüft Paketname, Archivpfade, Manifest und Größe; Quellverzeichnisse werden mit deaktivierten Lifecycle-Skripten neu gepackt. Jede Wiederherstellung durchläuft Build-Freigaben, Diagnose geteilter Abhängigkeiten und nötige Quarantäne. Alte node_modules sowie unbekannte oder Zugangsdaten enthaltende Adressen werden nie direkt ausgeführt.

<p align="center"><img src="./assets/readme/imported-plugin-restore-zh.png" width="900" alt="Quellenprüfung und lokale Wiederherstellung importierter Plugins"><br><sub>Quellenstatus, Online-Wiederherstellung und geschützte lokale Wiederherstellung</sub></p>

## Superverstärkte Diagnose

Drittanbieter-Plugins teilen den Node.js-Prozess und den Cordis-Servicegraphen des Hosts. Eine transitive Abhängigkeit, pnpm-Verlinkung oder ein alter Loader-Eintrag kann leere Tool-Aufrufe, .prepare-Fehler oder eine fehlende Plugin-Liste verursachen, bevor die Einstellungen geöffnet werden können.

Darum läuft die Diagnose in der Profile-Komposition und Boot-Schicht statt in einem gewöhnlichen Plugin. Vor Drittanbieter-Code liest sie Manifest, pnpm-lock.yaml, Workspace-Einstellungen, Bundle-Reihenfolge, den tatsächlich installierten Graphen und die gemeinsam genutzte Laufzeit der aktuellen Installation.

Cordis Context, Service und Symbol hängen von der physischen Modulidentität ab, nicht nur von der Version. Zwei gleich versionierte Kopien von @deepseek-ai/cordis oder dsh-tools an verschiedenen real paths bleiben getrennte JavaScript-Instanzen. Die Prüfung verfolgt jedes Root-Plugin, direkte und transitive Ketten, deklarierte Bereiche und endgültige Pfade; gültige peerDependencies werden nicht beanstandet.

Geprüft werden Host-Singletons, Profile-/Lockfile-Konsistenz, verwaiste oder doppelte Bundles, Geister-Plugins, pnpm Store, unvollständige Installationen, allowBuilds, prepare-Freigaben und Peer-Deduplizierung.

Die Reihenfolge lautet **nur lesend prüfen → verlustfrei zusammenführen → nur nötige Abhängigkeiten installieren → real paths erneut prüfen → falls nötig isolieren**. Ein gesundes Profile führt pnpm nicht aus. Verwaltete link:-Overrides gelten nur für kompatible Bereiche und senken niemals minimumReleaseAge oder überschreiben allowBuilds: false. Ein erfolgreicher pnpm-Befehl reicht nicht; erst konsistente physische Pfade und Loader-Zustände erlauben den Start.

Ist sichere Konvergenz nicht beweisbar, wird nur das verursachende Root-Plugin aus aktiven Abhängigkeiten und Bundle-Reihenfolge entfernt. Spezifikation, Version, Kette, Grund und Zeitpunkt bleiben erhalten. Quarantäne ist erst abgeschlossen, wenn das Paket physisch aus dem Profile entfernt ist, gemeinsame Host-Pakete auf kanonische Kopien zeigen und die Nachprüfung besteht. So wird aus einem unlesbaren Stack eine Erklärung: wer scheiterte, warum, welcher Schutz griff und was als Nächstes zu tun ist.

## Textauswahl und Kontextmenü

Markierter Nur-Lese-Text in Unterhaltung, Tool-Ausgabe, Details oder Dateivorschau zeigt eine horizontale Aktionsleiste. Ein Rechtsklick auf die Auswahl öffnet ein vertikales, abgerundetes Menü.

- **Kopieren** in die Systemzwischenablage.
- **In neuer Unterhaltung fragen**, ohne automatisch zu senden.
- **Zur aktuellen Unterhaltung hinzufügen** als Markdown-Zitat, ohne den Entwurf zu überschreiben.

Wartet die Sitzung auf Auswahl, Bestätigung oder Antwort oder ist der Editor gesperrt, wird „Zur aktuellen Unterhaltung hinzufügen“ automatisch ausgeblendet.

<p align="center">
  <strong>Auswahlleiste</strong><br>
  <img src="./assets/readme/selection-toolbar-zh.png" width="900" alt="Horizontale Leiste nach Textauswahl">
</p>

<p align="center">
  <strong>Kontextmenü</strong><br>
  <img src="./assets/readme/selection-context-menu-zh.png" width="900" alt="Vertikales Kontextmenü bei Rechtsklick">
</p>

## Desktop-Erlebnis

- Tray-Betrieb, vollständiges Beenden und Schnellneustart über macOS-Menüleiste oder Windows-/Linux-Tray.
- Benachrichtigungen bei Startfehler und Erholung, fester Harness-Logzugang, Hilfe nach 15 Sekunden Wartezeit.
- Release-Prüfung, Downloadfortschritt, SHA256SUMS-Prüfung und Öffnen des Installers in den allgemeinen Einstellungen.
- Sichere Registrierung und Entfernung des integrierten dsh-Befehls im System-PATH.
- Eigene Titelleiste unter Windows/Linux, natives macOS-Verhalten und begrenztes Schreiben in die Zwischenablage.
- Sechs geprüfte lokale Archive: Plugin Marketplace, dsh-im, dsh-skill-picker, dsh-font, Better Sidebar und dsh-pocket. Benutzer-Deinstallationen werden respektiert.
- Codex und Claude Code werden bei Bedarf über **Einstellungen → Externe Werkzeuge** installiert, nicht in den Installer eingebettet.

## Themes und Hintergründe

Unterstützt System, Hell, Dunkel und acht Produkt-Themes, acht integrierte Illustrationen und lokale PNG-/JPEG-/WebP-Hintergründe. Eigene Bilder bleiben im lokalen Browserspeicher und werden nicht an das Modell gesendet.

<table><tr><th width="50%">Themes</th><th width="50%">Hintergründe</th></tr><tr><td align="center"><img src="./assets/readme/theme-settings-en.png" alt="Theme-Einstellungen"></td><td align="center"><img src="./assets/readme/background-settings-en.png" alt="Hintergrund-Einstellungen"></td></tr></table>

## Download und Installation

Laden Sie das passende Paket von [GitHub Releases](https://github.com/flaqai/open-deepseek-harness-desktop/releases) herunter.

| System | Architektur | Paket |
| --- | --- | --- |
| macOS | Apple Silicon arm64 | DeepSeek-Harness-macos-arm64.dmg |
| macOS | Intel x64 | DeepSeek-Harness-macos-x64.dmg |
| Windows | x64 | DeepSeek-Harness-windows-x64.exe |
| Linux | Debian / Ubuntu x64 | DeepSeek-Harness-linux-x64.deb |
| Linux | Fedora / RHEL x64 | DeepSeek-Harness-linux-x64.rpm |

Prüfen Sie Dateien mit SHA256SUMS. macOS-Builds sind ad-hoc signiert und nicht notarisiert; bei einer Gatekeeper-Sperre wählen Sie **Systemeinstellungen → Datenschutz & Sicherheit → Dennoch öffnen**. Windows kann für neue oder unsignierte Builds eine Reputationswarnung anzeigen.

## Aus dem Quellcode starten

Installieren Sie Node.js ^22.19.0 oder 24+ und pnpm 11.7.0:

    git clone https://github.com/flaqai/open-deepseek-harness-desktop.git
    cd open-deepseek-harness-desktop
    pnpm install
    pnpm run build
    pnpm run dev:desktop

Für Web allein verwenden Sie pnpm dsh web. Source-Web verwendet das aktuelle DSH_HOME, normalerweise ~/.dsh; installierter Desktop verwendet das beim ersten Start gewählte Verzeichnis. Ob Daten geteilt werden, hängt von dieser Wahl ab.

## Sicherheit, Community und Lizenz

Der Renderer deaktiviert Node-Integration und aktiviert context isolation und Chromium-Sandbox. Navigation ist auf den exakten Harness-loopback-origin beschränkt; es gibt keine allgemeine Bridge für beliebige Befehle, Dateien oder URLs. API-Keys gehören in den Harness-Zugangsdienst.

- [Benutzerhandbuch](docs/user/guide/index.md), [Plugin-Handbuch](docs/user/develop/framework/index.md), [Skill-Handbuch](docs/subsystems/skills.md)
- Fehler und Vorschläge: [GitHub Issues](https://github.com/flaqai/open-deepseek-harness-desktop/issues)
- Upstream: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

Open DeepSeek Harness Desktop steht unter der [MIT-Lizenz](LICENSE). Drittanbieter-Lizenzen finden Sie in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Friends

- [DSHFind](https://dshfind.com/zh) — chinesische Lern- und Austausch-Community für DeepSeek Harness.
