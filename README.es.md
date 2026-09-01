<p align="center"><img src="./apps/desktop/src/icon.png" width="112" alt="Icono de Open DeepSeek Harness Desktop"></p>

# Open DeepSeek Harness Desktop

<p align="center"><strong>La edición comunitaria de escritorio de DeepSeek Harness, lista para usar y con dependencias más seguras</strong></p>

Idiomas: [简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · Español · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

> [!IMPORTANT]
>
> **[v0.1.2-alpha.1.1 ya está disponible. Es una actualización de corrección y mejora de v0.1.2-alpha.1: descárgala y pruébala](https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.1.2-alpha.1.1).** Esta versión mantiene DeepSeek Harness 0.1.2-alpha.1 como base del proyecto original y refuerza la gestión de entornos de escritorio, la recuperación de plugins y la estabilidad multiplataforma.
>
> **Principales novedades y mejoras:**
>
> - Permite elegir o cambiar de forma segura entre un directorio propio de Desktop, el directorio oficial de DSH, otro directorio compatible o un directorio vacío durante la configuración inicial y desde Ajustes generales. El cambio no copia, combina, sobrescribe ni elimina los datos originales.
> - Añade un paso de acceso desde el teléfono a la guía inicial para configurar el acceso por red local y las conexiones IM.
> - Muestra el plugin responsable, el motivo de la cuarentena y la acción de recuperación cuando se aísla un plugin. El diagnóstico puede limpiar estados obsoletos de eliminación de cuarentena y mantener la aplicación detenida de forma segura si falla la recuperación.
> - Detecta versiones comunitarias mediante etiquetas `odsh-v*`, las antiguas `dsh-v*` y las etiquetas `v*` normales. Windows y macOS pueden descargar y verificar el instalador correspondiente y muestran información clara cuando falla el proceso.
> - En Windows/Linux, la barra de título y el contenido de plugins de Harness se ejecutan en vistas nativas separadas, por lo que un plugin a pantalla completa no puede cubrir los botones de minimizar, maximizar o cerrar.
>
> **Correcciones importantes:**
>
> - Corrige los errores `EPERM`/rename de pnpm en Windows cuando un antivirus, indexador o proceso residual bloquea brevemente el directorio de un plugin durante su instalación o actualización.
> - Corrige registros de cuarentena que permanecían después de desinstalar un plugin problemático e impedían iniciar la aplicación o volver a instalar el plugin.
> - Corrige la carga de conversaciones antiguas cuando una llamada de herramienta vacía no contiene `tool source`.
> - Corrige la búsqueda de Releases comunitarias cuando no detectaba la última versión, quedaba bloqueada o elegía una versión preliminar incorrecta.
> - Refuerza el diagnóstico de módulos de cliente ausentes, conflictos de dependencias y fallos de carga con instrucciones concretas para reinstalar, reintentar o desinstalar.
> - Actualiza el mercado de plugins incluido, IM, Better Sidebar, Pocket y otros plugins, manteniendo versiones fijadas y comprobaciones de integridad SHA-512. Los plugins que el usuario desinstala expresamente no se restauran de forma automática.
>
> Esta es una versión Alpha preliminar. Haz una copia de seguridad de la configuración importante antes de actualizar y adjunta registros o informes de diagnóstico al comunicar problemas.

Open DeepSeek Harness Desktop es una distribución independiente y mantenida por la comunidad de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Los instaladores incluyen Node.js, pnpm y el runtime de Harness, de modo que puedes configurar modelos, ejecutar sesiones de programación, inspeccionar la ejecución, administrar plugins y Skills, y conectar herramientas externas o bots IM sin preparar un entorno de desarrollo.

> [!NOTE]
>
> Este repositorio no es un producto oficial de DeepSeek. Sigue en fase preliminar y pueden evolucionar el formato de datos, las políticas de compatibilidad y la instalación.

## Novedades de esta versión

- Importar la configuración oficial a un entorno independiente, compartir directamente un directorio existente o empezar desde cero.
- Comprobar el origen de plugins y restaurarlos de forma segura desde un directorio fuente o un archivo .tgz.
- Diagnosticar, reparar y aislar antes del arranque conflictos de pnpm, instancias duplicadas de Cordis, residuos del Loader y plugins fantasma.
- Copiar texto seleccionado, preguntarlo en una conversación nueva o añadirlo al borrador actual.
- Bandeja del sistema, reinicio rápido, notificaciones, registros, actualización en la aplicación y registro del comando dsh.
- Instaladores para Windows x64, macOS arm64/x64 y Linux DEB/RPM.

## Primer inicio y entornos de datos independientes

En el primer inicio, el cliente comprueba el directorio oficial predeterminado ~/.dsh. Si no existe o no es compatible, puedes seleccionar manualmente otro directorio admitido o crear un entorno vacío propiedad de Desktop.

### Importar a un entorno independiente

Copia configuración, credenciales, sesiones, información de espacios de trabajo, presets de Agent, Skills y estado de conexiones sin modificar el origen. No copia Profiles, node_modules, archivos de bloqueo, runtimes de plugins, registros de cuarentena o salud ni identificadores anónimos. Los plugins se reinstalan en el Profile de Desktop y los cambios posteriores quedan separados del CLI/Web oficial.

<p align="center"><img src="./assets/readme/data-home-import-en.png" width="900" alt="Importar una configuración oficial de DSH a un entorno independiente"><br><sub>Se copian los datos compatibles y se conserva intacto el origen</sub></p>

### Usar esta configuración directamente

Usa el directorio oficial ~/.dsh u otro directorio compatible sin crear una copia. La configuración, las credenciales, las sesiones, los presets, las Skills, los Profiles y los plugins quedan compartidos; Desktop y CLI/Web modifican los mismos datos.

<p align="center"><img src="./assets/readme/data-home-reuse-en.png" width="900" alt="Usar directamente una configuración DSH existente"><br><sub>Desktop comparte los datos del directorio seleccionado</sub></p>

### Empezar desde cero

Crea un directorio independiente y vacío sin leer ni importar configuración, sesiones o plugins existentes.

<p align="center"><img src="./assets/readme/data-home-fresh-en.png" width="900" alt="Crear un entorno DSH independiente y limpio"><br><sub>No se lee ni modifica ninguna configuración DSH existente</sub></p>

Después, el asistente permite configurar la API Key del modelo, bots IM como WeChat o Feishu y una conexión opcional con Codex. Todos los pasos se pueden omitir y completar más tarde en Ajustes.

## Selección y restauración de plugins importados

La importación independiente copia la configuración y una lista de restauración, pero nunca adopta el antiguo node_modules. La pantalla muestra estos estados:

- **Proporcionado por el cliente**: un preset incluido ya satisface el plugin.
- **Comprobando**: el origen se resuelve en un directorio temporal sin tocar el Profile activo.
- **Disponible en línea**: puede reinstalarse con el pnpm incluido.
- **Origen en línea no disponible**: no existe el paquete, repositorio o Git ref.
- **No se puede comprobar temporalmente**: desconexión, tiempo agotado, autenticación o límite de solicitudes; se puede reintentar.

Si el origen en línea no está disponible, el usuario puede elegir un directorio fuente o un .tgz. El cliente valida nombre del paquete, rutas del archivo, manifest y tamaño; los directorios se vuelven a empaquetar con scripts de ciclo de vida desactivados. Toda restauración pasa por permisos de compilación, diagnóstico de dependencias compartidas y cuarentena cuando sea necesaria. Nunca se copia el node_modules antiguo ni se ejecutan directamente direcciones con credenciales o especificaciones desconocidas.

<p align="center"><img src="./assets/readme/imported-plugin-restore-zh.png" width="900" alt="Comprobación de origen y restauración local de plugins importados"><br><sub>Estado del origen, restauración en línea y restauración local protegida</sub></p>

## Diagnóstico superreforzado

Los plugins de terceros comparten el proceso Node.js y el grafo de servicios Cordis del Host. Una dependencia transitiva, la forma en que pnpm crea enlaces o una entrada antigua del Loader puede provocar llamadas de herramientas vacías, errores .prepare o una lista de plugins ausente antes incluso de que Ajustes pueda abrirse.

Por eso el diagnóstico vive en la composición del Profile y en el arranque, no en otro plugin ordinario. Antes de ejecutar código de terceros lee el manifest, pnpm-lock.yaml, los ajustes del Workspace, el orden de Bundles, el grafo instalado real y el runtime compartido de la instalación actual.

Los Context, Service y Symbol de Cordis dependen de la identidad física del módulo, no solo de su versión. Dos copias de @deepseek-ai/cordis o dsh-tools con la misma versión pero distinto real path siguen siendo instancias JavaScript diferentes. La inspección recorre cada plugin raíz, sus dependencias directas y transitivas, rangos declarados y rutas finales; los peerDependencies válidos no se marcan como error.

Se comprueban los singletons compartidos del Host, la coherencia entre Profile y lockfile, Bundles huérfanos o duplicados, plugins fantasma, el Store de pnpm, instalaciones incompletas, allowBuilds, permisos de prepare y configuración de deduplicación peer.

El orden de reparación es **inspección de solo lectura → convergencia sin pérdida → instalar solo lo necesario → volver a comprobar real paths → cuarentena si hace falta**. Un Profile sano no ejecuta pnpm. Los overrides administrados link: solo se usan cuando el rango es compatible y nunca reducen minimumReleaseAge ni anulan allowBuilds: false. Un comando pnpm correcto no basta: el arranque continúa únicamente cuando las rutas físicas y el Loader vuelven a ser coherentes.

Si la convergencia no puede demostrarse segura, solo se retira el plugin raíz responsable de las dependencias activas y del orden de Bundle. Se conservan su especificación, versión, cadena, motivo y fecha. La cuarentena termina únicamente cuando el paquete ha salido físicamente del Profile, los Host compartidos apuntan a las copias canónicas y la reinspección es correcta. El objetivo es explicar quién falló, por qué, qué protección se aplicó y cuál es el siguiente paso.

## Selección de texto y menú contextual

Al seleccionar texto de solo lectura en mensajes, resultados de herramientas, detalles o vistas previas aparece una barra horizontal. Al hacer clic derecho sobre la selección aparece un menú vertical redondeado.

- **Copiar**: escribe la selección en el portapapeles.
- **Preguntar en una conversación nueva**: crea una conversación y rellena la pregunta sin enviarla automáticamente.
- **Añadir a la conversación actual**: agrega una cita Markdown después del borrador existente sin reemplazarlo.

Si la sesión espera una elección, confirmación o respuesta, o el editor está desactivado, la opción de añadir a la conversación actual se oculta automáticamente.

<p align="center">
  <strong>Barra de selección</strong><br>
  <img src="./assets/readme/selection-toolbar-zh.png" width="900" alt="Barra horizontal tras seleccionar texto">
</p>

<p align="center">
  <strong>Menú contextual</strong><br>
  <img src="./assets/readme/selection-context-menu-zh.png" width="900" alt="Menú vertical al hacer clic derecho">
</p>

## Experiencia de escritorio

- Ejecución en bandeja, salida completa y reinicio rápido desde la barra de menús de macOS o la bandeja de Windows/Linux.
- Notificaciones de fallo y recuperación, acceso al registro fijo de Harness y ayuda cuando el inicio tarda más de 15 segundos.
- Comprobación de Releases, progreso de descarga, validación de SHA256SUMS y apertura del instalador desde Ajustes generales.
- Registro y eliminación segura del comando dsh incluido en el PATH del sistema.
- Barra de título personalizada en Windows/Linux, comportamiento nativo de macOS y acceso limitado de escritura al portapapeles.
- Seis archivos locales verificados: Plugin Marketplace, dsh-im, dsh-skill-picker, dsh-font, Better Sidebar y dsh-pocket. Si el usuario los desinstala, no se reinstalan solos.
- Codex y Claude Code se instalan bajo demanda desde Ajustes → Herramientas externas, no se incluyen en el instalador.

## Temas y fondos

Admite sistema, claro, oscuro y ocho temas de producto, ocho ilustraciones incluidas y fondos PNG/JPEG/WebP locales. Las imágenes personalizadas permanecen en el almacenamiento local del navegador y no se envían al modelo.

<table><tr><th width="50%">Temas</th><th width="50%">Fondos</th></tr><tr><td align="center"><img src="./assets/readme/theme-settings-en.png" alt="Ajustes de temas"></td><td align="center"><img src="./assets/readme/background-settings-en.png" alt="Ajustes de fondos"></td></tr></table>

## Descargar e instalar

Descarga el archivo apropiado desde [GitHub Releases](https://github.com/flaqai/open-deepseek-harness-desktop/releases).

| Sistema | Arquitectura | Paquete |
| --- | --- | --- |
| macOS | Apple Silicon arm64 | DeepSeek-Harness-macos-arm64.dmg |
| macOS | Intel x64 | DeepSeek-Harness-macos-x64.dmg |
| Windows | x64 | DeepSeek-Harness-windows-x64.exe |
| Linux | Debian / Ubuntu x64 | DeepSeek-Harness-linux-x64.deb |
| Linux | Fedora / RHEL x64 | DeepSeek-Harness-linux-x64.rpm |

Verifica los archivos con SHA256SUMS. Las compilaciones de macOS usan firma ad-hoc y no están notarizadas; si Gatekeeper las bloquea, usa **Ajustes del sistema → Privacidad y seguridad → Abrir igualmente**. Windows puede mostrar una advertencia de reputación para una compilación nueva o sin firma.

## Ejecutar desde el código fuente

Instala Node.js ^22.19.0 o 24+ y pnpm 11.7.0:

    git clone https://github.com/flaqai/open-deepseek-harness-desktop.git
    cd open-deepseek-harness-desktop
    pnpm install
    pnpm run build
    pnpm run dev:desktop

Para Web usa pnpm dsh web. Web desde código usa el DSH_HOME actual (normalmente ~/.dsh); Desktop instalado usa el directorio elegido al primer inicio. Compartir datos depende de esa elección.

## Seguridad, comunidad y licencia

El renderer desactiva la integración de Node y activa context isolation y el sandbox de Chromium. La navegación se limita al origen loopback exacto de Harness y no existe un bridge genérico para comandos, archivos o URL arbitrarias. Guarda las API Key mediante el servicio de credenciales de Harness.

- [Guía de usuario](docs/user/guide/index.md), [guía de plugins](docs/user/develop/framework/index.md), [guía de Skills](docs/subsystems/skills.md)
- Errores y propuestas: [GitHub Issues](https://github.com/flaqai/open-deepseek-harness-desktop/issues)
- Proyecto original: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

Open DeepSeek Harness Desktop se publica bajo la [Licencia MIT](LICENSE). Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para las licencias de terceros.

## Friends

- [DSHFind](https://dshfind.com/zh) — comunidad china de aprendizaje y recursos de DeepSeek Harness.
