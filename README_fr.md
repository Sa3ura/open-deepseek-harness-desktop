# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | Français | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop est une distribution de bureau de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), maintenue indépendamment par la communauté. Elle associe l'environnement d'agents fondé sur des plugins à un espace visuel pour gérer les API compatibles, les modèles personnalisés, les espaces de travail, les sessions, les plugins et les Skills.

Ce projet n'est pas un produit officiel de DeepSeek. Il est publié sous [licence MIT](LICENSE) et se trouve actuellement en phase d'aperçu pour les développeurs.

## Fonctionnalités principales

- Configurez DeepSeek ou une API compatible, son URL de base, la référence de clé et les identifiants de modèle lors du démarrage ou dans les paramètres.
- Gérez les sessions persistantes, copiez ou supprimez des messages, effacez l'historique et consultez les étapes d'exécution importantes.
- Installez les plugins de registre pris en charge via un parcours contrôlé en un clic, puis utilisez les Skills, thèmes et arrière-plans locaux.
- L'exécution de bureau depuis les sources a d'abord été validée sur macOS. Les installateurs Windows et Linux nécessitent encore un empaquetage et une validation native.

## Exécuter depuis les sources

Installez Node.js `^22.19.0 || >=24.0.0` et pnpm `11.7.0`, puis exécutez :

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Consultez le [README anglais](README.md) ou le [README chinois simplifié](README.zh.md) pour les fonctionnalités complètes, l'architecture, la sécurité et l'état des plateformes. La [référence de l'application](apps/desktop/README.md) et le [guide utilisateur](docs/user/guide/index.md) sont également disponibles.

## À propos de FLAQ.AI

[FLAQ.AI](https://flaq.ai/) donne accès à des modèles d'image, de vidéo, d'audio et de langage via des API, de la documentation et des workflows pour développeurs. Ce service n'est pas nécessaire au fonctionnement du projet. Vérifiez les capacités, tarifs et conditions de traitement des données dans la [documentation FLAQ.AI](https://flaq.ai/docs/) avant utilisation.

## Licence

Ce projet est disponible sous [licence MIT](LICENSE).
