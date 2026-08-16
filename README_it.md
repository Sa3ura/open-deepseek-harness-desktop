# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | Italiano | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop è una distribuzione desktop di [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) gestita in modo indipendente dalla comunità. Unisce il runtime per agenti basato su plugin a uno spazio visivo per gestire API compatibili, modelli personalizzati, workspace, sessioni, plugin e Skill.

Questo progetto non è un prodotto ufficiale DeepSeek. È distribuito con [licenza MIT](LICENSE) ed è attualmente in anteprima per sviluppatori.

## Funzionalità principali

- Configura DeepSeek o un'API compatibile, l'URL di base, il riferimento alla chiave e gli identificatori dei modelli durante l'avvio o nelle impostazioni.
- Gestisce sessioni persistenti, copia o elimina messaggi, cancella le conversazioni e mostra i passaggi di esecuzione più importanti.
- Installa plugin di registro supportati tramite un flusso controllato con un clic e usa Skill, temi e sfondi chat locali.
- L'esecuzione desktop dal codice sorgente è stata verificata prima su macOS. Gli installer Windows e Linux richiedono ancora pacchettizzazione e convalida nativa.

## Avvio dal codice sorgente

Installa Node.js `^22.19.0 || >=24.0.0` e pnpm `11.7.0`, quindi esegui:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Consulta il [README inglese](README.md) o il [README in cinese semplificato](README.zh.md) per funzionalità complete, architettura, sicurezza e stato delle piattaforme. Sono disponibili anche il [riferimento desktop](apps/desktop/README.md) e la [guida utente](docs/user/guide/index.md).

## Informazioni su FLAQ.AI

[FLAQ.AI](https://flaq.ai/) offre modelli per immagini, video, audio e linguaggio tramite API, documentazione e workflow per sviluppatori. Non è necessario per eseguire questo progetto. Prima dell'uso, verifica supporto, prezzi e condizioni di trattamento dei dati nella [documentazione FLAQ.AI](https://flaq.ai/docs/).

## Licenza

Questo progetto è disponibile con [licenza MIT](LICENSE).
