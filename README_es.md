# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | Español | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop es una distribución de escritorio de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) mantenida de forma independiente por la comunidad. Combina el entorno de agentes basado en plugins con un espacio visual para gestionar APIs compatibles, modelos personalizados, espacios de trabajo, sesiones, plugins y Skills.

Este proyecto no es un producto oficial de DeepSeek. Se publica con [licencia MIT](LICENSE) y se encuentra en fase de vista previa para desarrolladores.

## Funciones principales

- Configura DeepSeek o una API compatible, su URL base, la referencia de la clave y los identificadores de modelo durante el inicio o desde Ajustes.
- Gestiona sesiones persistentes, copia o elimina mensajes, limpia conversaciones y revisa un resumen de los pasos de ejecución importantes.
- Instala plugins compatibles del registro mediante un flujo controlado de un clic y utiliza Skills, temas y fondos de chat locales.
- La ejecución de escritorio desde el código fuente se ha probado primero en macOS. Los instaladores de Windows y Linux aún requieren empaquetado y validación nativa.

## Ejecutar desde el código fuente

Instala Node.js `^22.19.0 || >=24.0.0` y pnpm `11.7.0`, y ejecuta:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Consulta la [README en inglés](README.md) o la [README en chino simplificado](README.zh.md) para conocer todas las funciones, la arquitectura, la seguridad y el estado de cada plataforma. También están disponibles la [referencia de escritorio](apps/desktop/README.md) y la [guía de usuario](docs/user/guide/index.md).

## Acerca de FLAQ.AI

[FLAQ.AI](https://flaq.ai/) ofrece modelos de imagen, vídeo, audio y lenguaje mediante APIs, documentación y flujos para desarrolladores. No es necesario para ejecutar este proyecto. Antes de usarlo, consulta la compatibilidad, los precios y las condiciones de tratamiento de datos actuales en la [documentación de FLAQ.AI](https://flaq.ai/docs/).

## Licencia

Este proyecto se distribuye con [licencia MIT](LICENSE).
