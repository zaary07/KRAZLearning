# JabouTube — famille privée

Application Web / PWA personnelle et familiale, avec lecture YouTube intégrée lorsque autorisée, recherche dépendant de fournisseurs externes, favoris et historique local.

## Activer la restriction aux membres de la famille
Configurer les variables d’environnement du service Render **jaboutude-server** :
- `GOOGLE_CLIENT_ID` : ID client OAuth 2.0 Web Google, avec origines autorisées correspondant à l’URL du serveur et, si utilisé, au site iOS.
- `JABOUTUBE_ALLOWED_EMAILS` : liste des adresses Google autorisées, séparées par des virgules.

**Important : sans liste d’adresses `JABOUTUBE_ALLOWED_EMAILS`, le mode privé n’est PAS actif et les API vidéo restent accessibles publiquement.** Lorsque cette liste est configurée, les API vidéo vérifient le jeton Google et refusent les autres comptes. L’interface statique peut néanmoins être chargée sans connexion ; elle ne fournit pas l’accès aux API privées.

Chaque membre se connecte avec son propre compte Google. Historique, favoris et positions de lecture sont séparés par identifiant de compte dans le stockage local de chaque navigateur. Ils ne sont **pas synchronisés entre appareils, ni chiffrés** : ce mécanisme ne protège pas contre une personne ayant accès au stockage du navigateur. Pour des données réellement privées sur un appareil partagé et synchronisées, prévoir un stockage serveur avec contrôle d’accès par utilisateur.

Le lecteur ne contourne pas les droits d’auteur ni les restrictions de diffusion, et dépend de la disponibilité des sources YouTube et communautaires.

Démarrage local : `node jaboutude/server.mjs` (Render fournit `PORT`).
