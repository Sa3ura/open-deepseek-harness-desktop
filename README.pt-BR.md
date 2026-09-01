<p align="center"><img src="./apps/desktop/src/icon.png" width="112" alt="Ícone do Open DeepSeek Harness Desktop"></p>

# Open DeepSeek Harness Desktop

<p align="center"><strong>A edição desktop comunitária do DeepSeek Harness, pronta para usar e com segurança reforçada de dependências</strong></p>

Idiomas: [简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · Português

> [!IMPORTANT]
>
> **[A v0.1.2-alpha.1.1 já está disponível. Esta atualização corretiva da v0.1.2-alpha.1 está pronta para baixar e experimentar](https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.1.2-alpha.1.1).** Esta versão continua usando o DeepSeek Harness 0.1.2-alpha.1 como base upstream e reforça o gerenciamento do ambiente Desktop, a recuperação de plugins e a estabilidade multiplataforma.
>
> **Principais novidades e melhorias:**
>
> - Escolha ou alterne com segurança entre um diretório próprio do Desktop, o diretório oficial do DSH, outro diretório compatível ou um diretório vazio durante a configuração inicial e nas Configurações gerais. A troca não copia, mescla, sobrescreve nem exclui os dados originais.
> - Configure o acesso pelo celular na rede local e as conexões IM na nova etapa de acesso móvel do guia inicial.
> - Veja o plugin responsável, o motivo da quarentena e a ação de recuperação quando um plugin é isolado. O diagnóstico pode limpar estados obsoletos de remoção da quarentena e manter o aplicativo interrompido com segurança se a recuperação falhar.
> - Encontre versões da comunidade publicadas com tags `odsh-v*`, tags antigas `dsh-v*` e tags `v*` comuns. Windows e macOS podem baixar e verificar o instalador correspondente e exibem informações claras em caso de falha.
> - No Windows/Linux, a barra de título e o conteúdo dos plugins do Harness usam visualizações nativas separadas, impedindo que plugins em tela cheia cubram os botões de minimizar, maximizar ou fechar.
>
> **Correções importantes:**
>
> - Corrige erros `EPERM`/rename do pnpm no Windows quando antivírus, indexadores ou processos residuais bloqueiam brevemente o diretório de um plugin durante a instalação ou atualização.
> - Corrige registros de quarentena que permaneciam após desinstalar um plugin problemático e impediam o aplicativo de iniciar ou o plugin de ser instalado novamente.
> - Corrige o carregamento de conversas antigas quando uma chamada de ferramenta vazia não contém `tool source`.
> - Corrige a verificação de Releases da comunidade quando ela não encontrava a versão mais recente, permanecia em andamento ou selecionava a prévia errada.
> - Reforça o diagnóstico de módulos de cliente ausentes, conflitos de dependências e falhas de carregamento com orientações práticas para reinstalar, tentar novamente ou desinstalar.
> - Atualiza o mercado de plugins incluído, IM, Better Sidebar, Pocket e outros plugins, mantendo versões fixadas e verificações de integridade SHA-512. Plugins desinstalados explicitamente pelo usuário não são restaurados automaticamente.
>
> Esta é uma prévia Alpha. Faça backup das configurações importantes antes de atualizar e inclua logs ou relatórios de diagnóstico relevantes ao comunicar problemas.

Open DeepSeek Harness Desktop é uma distribuição independente e mantida pela comunidade do [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Os instaladores incluem Node.js, pnpm e o runtime Harness, permitindo configurar modelos, executar sessões de código, revisar a execução, gerenciar plugins e Skills e conectar ferramentas externas ou bots IM sem preparar um ambiente de desenvolvimento.

> [!NOTE]
>
> Este repositório não é um produto oficial da DeepSeek. Ele continua em prévia; formatos de dados, políticas de compatibilidade e instalação ainda podem evoluir.

## Destaques desta versão

- Importar a configuração oficial para um ambiente independente, compartilhar diretamente um diretório existente ou começar do zero.
- Verificar fontes de plugins e restaurar com segurança a partir de um diretório-fonte ou arquivo .tgz.
- Diagnosticar, reparar e isolar antes da inicialização conflitos do pnpm, instâncias Cordis duplicadas, resíduos do Loader e plugins fantasmas.
- Copiar texto selecionado, perguntar em uma nova conversa ou adicionar ao rascunho atual.
- Bandeja, reinício rápido, notificações, logs, atualização no aplicativo e registro do comando dsh.
- Pacotes Windows x64, macOS arm64/x64 e Linux DEB/RPM.

## Primeira execução e ambientes independentes

Na primeira execução, o cliente verifica o diretório oficial padrão ~/.dsh. Se ele não existir ou não for compatível, você pode escolher outro diretório aceito ou criar um ambiente vazio pertencente ao Desktop.

### Importar para um ambiente independente

Configurações, credenciais, sessões, informações de workspaces, presets de Agent, Skills e conexões são copiados sem alterar a origem. Profiles, node_modules, lockfiles, runtimes de plugins, registros de quarentena/saúde e identificadores anônimos não são copiados. Os plugins são reinstalados no Profile do Desktop e as alterações posteriores ficam separadas do CLI/Web oficial.

<p align="center"><img src="./assets/readme/data-home-import-en.png" width="900" alt="Importar uma configuração DSH oficial para um ambiente independente"><br><sub>Copiar os dados compatíveis e manter a origem inalterada</sub></p>

### Usar esta configuração diretamente

Usa ~/.dsh ou outro diretório compatível sem criar uma segunda cópia. Configurações, credenciais, sessões, presets, Skills, Profiles e plugins são compartilhados; Desktop e CLI/Web alteram os mesmos dados.

<p align="center"><img src="./assets/readme/data-home-reuse-en.png" width="900" alt="Usar diretamente uma configuração DSH existente"><br><sub>Desktop compartilha os dados do diretório selecionado</sub></p>

### Começar do zero

Cria um ambiente vazio e independente sem ler ou importar configurações, sessões ou plugins existentes.

<p align="center"><img src="./assets/readme/data-home-fresh-en.png" width="900" alt="Criar um ambiente DSH independente e limpo"><br><sub>Nenhuma configuração DSH existente é lida ou alterada</sub></p>

Depois, o assistente orienta a configuração da API Key do modelo, bots IM como WeChat e Feishu e uma conexão opcional com Codex. Todas as etapas podem ser ignoradas e concluídas mais tarde nas Configurações.

## Seleção e restauração de plugins importados

A importação independente copia a configuração e a lista de restauração, nunca o node_modules antigo. Cada entrada recebe o estado **fornecido pelo cliente**, **verificando**, **disponível online**, **fonte online indisponível** ou **temporariamente impossível verificar** por rede, timeout, autenticação ou limite de requisições.

Se a fonte online estiver indisponível, o usuário pode escolher um diretório-fonte ou .tgz. O cliente valida nome do pacote, caminhos do arquivo, manifest e tamanho; diretórios são empacotados novamente com scripts de ciclo de vida desativados. Toda restauração passa por permissões de build, diagnóstico de dependências compartilhadas e quarentena quando necessário. O node_modules antigo e endereços desconhecidos ou com credenciais nunca são executados diretamente.

<p align="center"><img src="./assets/readme/imported-plugin-restore-zh.png" width="900" alt="Verificação de fonte e restauração local de plugins importados"><br><sub>Estado da fonte, restauração online e restauração local protegida</sub></p>

## Diagnóstico super-reforçado

Plugins de terceiros compartilham o processo Node.js e o grafo de serviços Cordis do Host. Uma dependência transitiva, a forma de link do pnpm ou uma entrada antiga do Loader pode causar chamadas vazias de ferramentas, erros .prepare ou uma lista de plugins ausente antes de as Configurações abrirem.

Por isso o diagnóstico roda na composição do Profile e na camada de inicialização, não em outro plugin comum. Antes do código de terceiros, ele lê manifest, pnpm-lock.yaml, configurações do Workspace, ordem dos Bundles, grafo realmente instalado e runtime compartilhado da instalação atual.

Context, Service e Symbol do Cordis dependem da identidade física do módulo, não apenas da versão. Duas cópias de @deepseek-ai/cordis ou dsh-tools na mesma versão, mas em real paths diferentes, continuam sendo instâncias JavaScript distintas. A inspeção percorre cada plugin raiz, dependências diretas e transitivas, intervalos declarados e caminhos resolvidos; peerDependencies válidos não são sinalizados.

São verificados singletons do Host, consistência de Profile/lockfile, Bundles órfãos ou duplicados, plugins fantasmas, Store do pnpm, instalações incompletas, allowBuilds, permissões de prepare e deduplicação peer.

A ordem é **inspeção somente leitura → convergência sem perda → instalar apenas o necessário → reverificar real paths → colocar em quarentena se necessário**. Um Profile saudável não executa pnpm. Overrides gerenciados link: são usados apenas com intervalo compatível e nunca reduzem minimumReleaseAge nem substituem allowBuilds: false. O sucesso do pnpm não basta: a inicialização só continua após caminhos físicos e Loader estarem consistentes.

Se a convergência segura não puder ser comprovada, apenas o plugin raiz responsável é removido das dependências ativas e da ordem de Bundles. Especificação, versão, cadeia, motivo e data são preservados. A quarentena termina somente quando o pacote sai fisicamente do Profile, os Hosts compartilhados apontam para cópias canônicas e a reinspeção passa. Assim, o cliente explica quem falhou, por quê, qual proteção foi aplicada e o próximo passo.

## Seleção de texto e menu de contexto

Selecionar texto somente leitura em conversas, saída de ferramentas, detalhes ou prévias de arquivos mostra uma barra horizontal. Clicar com o botão direito na seleção abre um menu vertical arredondado.

- **Copiar** para a área de transferência.
- **Perguntar em uma nova conversa** sem enviar automaticamente.
- **Adicionar à conversa atual** como citação Markdown sem substituir o rascunho.

Quando a sessão aguarda escolha, confirmação ou resposta, ou o editor está desativado, “Adicionar à conversa atual” é ocultado automaticamente.

<p align="center">
  <strong>Barra de seleção</strong><br>
  <img src="./assets/readme/selection-toolbar-zh.png" width="900" alt="Barra horizontal após selecionar texto">
</p>

<p align="center">
  <strong>Menu de contexto</strong><br>
  <img src="./assets/readme/selection-context-menu-zh.png" width="900" alt="Menu vertical ao clicar com o botão direito">
</p>

## Experiência desktop

- Execução na bandeja, saída completa e reinício rápido pela barra de menus do macOS ou bandeja do Windows/Linux.
- Notificações de falha e recuperação, acesso ao log fixo do Harness e ajuda após 15 segundos de espera.
- Verificação de Release, progresso de download, validação de SHA256SUMS e abertura do instalador nas Configurações gerais.
- Registro e remoção seguros do comando dsh incluído no PATH do sistema.
- Barra de título personalizada no Windows/Linux, comportamento nativo no macOS e escrita limitada na área de transferência.
- Seis arquivos locais verificados: Plugin Marketplace, dsh-im, dsh-skill-picker, dsh-font, Better Sidebar e dsh-pocket. A desinstalação do usuário é respeitada.
- Codex e Claude Code são instalados sob demanda em **Configurações → Ferramentas externas**, não incluídos nos instaladores.

## Temas e fundos

Suporta sistema, claro, escuro e oito temas de produto, oito ilustrações integradas e fundos locais PNG/JPEG/WebP. Imagens personalizadas permanecem no armazenamento local do navegador e não são enviadas ao modelo.

<table><tr><th width="50%">Temas</th><th width="50%">Fundos</th></tr><tr><td align="center"><img src="./assets/readme/theme-settings-en.png" alt="Configurações de temas"></td><td align="center"><img src="./assets/readme/background-settings-en.png" alt="Configurações de fundos"></td></tr></table>

## Download e instalação

Baixe o pacote adequado em [GitHub Releases](https://github.com/flaqai/open-deepseek-harness-desktop/releases).

| Sistema | Arquitetura | Pacote |
| --- | --- | --- |
| macOS | Apple Silicon arm64 | DeepSeek-Harness-macos-arm64.dmg |
| macOS | Intel x64 | DeepSeek-Harness-macos-x64.dmg |
| Windows | x64 | DeepSeek-Harness-windows-x64.exe |
| Linux | Debian / Ubuntu x64 | DeepSeek-Harness-linux-x64.deb |
| Linux | Fedora / RHEL x64 | DeepSeek-Harness-linux-x64.rpm |

Verifique os arquivos com SHA256SUMS. Builds macOS usam assinatura ad-hoc e não são notarizados; se o Gatekeeper bloquear, use **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**. O Windows pode exibir aviso de reputação para builds novos ou sem assinatura.

## Executar a partir do código-fonte

Instale Node.js ^22.19.0 ou 24+ e pnpm 11.7.0:

    git clone https://github.com/flaqai/open-deepseek-harness-desktop.git
    cd open-deepseek-harness-desktop
    pnpm install
    pnpm run build
    pnpm run dev:desktop

Para somente Web, use pnpm dsh web. O Web do código-fonte usa o DSH_HOME atual, normalmente ~/.dsh; o Desktop instalado usa o diretório escolhido na primeira execução. O compartilhamento depende dessa escolha.

## Segurança, comunidade e licença

O renderer desativa integração Node e ativa context isolation e sandbox do Chromium. A navegação é limitada à origem loopback exata do Harness; não há bridge genérica para comandos, arquivos ou URLs arbitrários. Armazene API Keys no serviço de credenciais do Harness.

- [Guia do usuário](docs/user/guide/index.md), [guia de plugins](docs/user/develop/framework/index.md), [guia de Skills](docs/subsystems/skills.md)
- Bugs e sugestões: [GitHub Issues](https://github.com/flaqai/open-deepseek-harness-desktop/issues)
- Upstream: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

Open DeepSeek Harness Desktop é disponibilizado sob a [Licença MIT](LICENSE). Licenças de terceiros estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Friends

- [DSHFind](https://dshfind.com/zh) — comunidade chinesa de aprendizado e compartilhamento sobre DeepSeek Harness.
