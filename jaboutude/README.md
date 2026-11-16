# JabouTube — accès familial par invitation

Application Web (PWA) personnelle et familiale. Lecture YouTube intégrée dans les limites autorisées par YouTube, recherche dépendant de fournisseurs externes, favoris et historique local.

## Lien d'invitation (sans connaître les adresses Gmail)

Le propriétaire ouvre `https://jaboutude-server.onrender.com/admin.html`, saisit sa **clé administrateur** et le prénom/surnom du membre, puis partage son lien personnel.

Sur son propre téléphone, le membre ouvre ce lien : la PWA échange l'invitation contre une session signée et la mémorise localement. Aux visites suivantes sur le même stockage de navigateur, il reste connecté automatiquement. Aucun compte Google n'est demandé en mode invitation.

Chaque membre reçoit **un lien distinct**, sinon les deux appareils partageraient le même identifiant et les mêmes données locales de profil.

## Configuration de Render

Sur le service **jaboutude-server**, définir les deux variables d'environnement :

- `JABOUTUBE_INVITE_SECRET` — valeur secrète aléatoire d'au moins 32 caractères utilisée pour signer les invitations et sessions.
- `JABOUTUBE_ADMIN_KEY` — clé administrateur d'au moins 24 caractères utilisée par `admin.html`.

Ces deux valeurs ne doivent jamais être écrites dans le dépôt GitHub ni intégrées dans l'application ou l'APK. Elles restent côté serveur.

Si `JABOUTUBE_INVITE_SECRET` est défini mais la configuration est incomplète, les APIs sont verrouillées ; la liste Google `JABOUTUBE_ALLOWED_EMAILS` est ignorée dans ce mode. Si aucune configuration familiale n'est définie, les APIs restent publiques (mode hérité) : il faut activer le mode invitation pour obtenir l'accès privé.

## Limitations de sécurité de cette première version

- Les invitations expirent au bout de 14 jours mais **ne sont pas à usage unique** : quelqu'un à qui le lien est transféré peut s'en servir durant cette période.
- Les sessions durent au maximum 365 jours ; faute de base de données persistante, elles ne peuvent pas être révoquées individuellement. Changer `JABOUTUBE_INVITE_SECRET` invalide toutes les sessions/invitations.
- Les historiques, favoris et positions sont séparés **dans le stockage local du navigateur** par identifiant de membre. Ils ne sont pas synchronisés entre appareils ni chiffrés, et restent accessibles à une personne ayant un accès technique aux données du navigateur.
- Un APK générique ne peut pas déterminer seul quel membre l'a installé. L'activation requiert un lien individuel ou un code d'invitation. Pour une meilleure sécurité (invitations à usage unique, révocation et synchronisation), ajouter une base de données avec comptes et sessions côté serveur.
- Les sources YouTube qui ont été retirées ou restreignent l'intégration restent indisponibles.

Démarrage local : `node jaboutude/server.mjs` (Render fournit `PORT`).
