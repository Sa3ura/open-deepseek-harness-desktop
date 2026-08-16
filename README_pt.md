# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | Português | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop é uma distribuição desktop do [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), mantida de forma independente pela comunidade. Ela combina o ambiente de agentes baseado em plugins com uma área visual para gerenciar APIs compatíveis, modelos personalizados, espaços de trabalho, sessões, plugins e Skills.

Este projeto não é um produto oficial da DeepSeek. Ele é publicado sob a [Licença MIT](LICENSE) e está em fase de prévia para desenvolvedores.

## Principais recursos

- Configure o DeepSeek ou uma API compatível, sua URL base, a referência da chave e os identificadores de modelos na introdução ou nas Configurações.
- Gerencie sessões persistentes, copie ou exclua mensagens, limpe conversas e revise os principais passos de execução.
- Instale plugins de registro compatíveis por um fluxo controlado de um clique e use Skills, temas e fundos de chat locais.
- A execução desktop pelo código-fonte foi verificada primeiro no macOS. Os instaladores para Windows e Linux ainda exigem empacotamento e validação nativa.

## Executar a partir do código-fonte

Instale Node.js `^22.19.0 || >=24.0.0` e pnpm `11.7.0`, depois execute:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Consulte o [README em inglês](README.md) ou o [README em chinês simplificado](README.zh.md) para ver todos os recursos, a arquitetura, a segurança e o estado das plataformas. Também estão disponíveis a [referência do desktop](apps/desktop/README.md) e o [guia do usuário](docs/user/guide/index.md).

## Sobre a FLAQ.AI

A [FLAQ.AI](https://flaq.ai/) fornece modelos de imagem, vídeo, áudio e linguagem por meio de APIs, documentação e fluxos para desenvolvedores. Ela não é necessária para executar este projeto. Antes de usar, confirme o suporte atual, os preços e os termos de tratamento de dados na [documentação da FLAQ.AI](https://flaq.ai/docs/).

## Licença

Este projeto está disponível sob a [Licença MIT](LICENSE).
