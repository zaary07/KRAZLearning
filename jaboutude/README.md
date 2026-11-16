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

## Connexion Google / YouTube
La liaison est facultative en mode invitation familiale et n’a pas besoin de la liste des adresses Gmail des proches. Elle **ne fonctionne pas sans configuration Google Cloud**.

1. Créer un projet Google Cloud et activer **YouTube Data API v3**.
2. Dans Google Auth Platform / Clients, créer un identifiant OAuth 2.0 de type **Application Web**.
3. Ajouter les origines JavaScript autorisées :
   - `https://jaboutude-server.onrender.com`
   - `https://jaboutude-ios.onrender.com`
4. Configurer les paramètres de consentement OAuth nécessaires (utilisateurs autorisés / éventuelle vérification Google), puis inscrire **uniquement le Client ID** dans `GOOGLE_CLIENT_ID` sur le service Render.

La liaison permet d’afficher les playlists et les abonnements avec le scope `youtube.readonly`, mais ne donne pas accès à l’historique complet de visionnage ni aux avantages Premium dans le lecteur intégré. Les autorisations Google ne sont pas conservées entre sessions prolongées : l’utilisateur peut devoir se reconnecter.

## Écran verrouillé
Le lecteur vidéo YouTube intégré n’est **pas** un lecteur audio en arrière-plan. JabouTube propose un bouton vers la vidéo officielle YouTube, à la même position temporelle quand elle est connue. L’écoute écran verrouillé dans l’application YouTube dépend de la prise en charge de YouTube Premium et des règles de l’application. Les tentatives antérieures d’extraction audio via Invidious, qui échouaient souvent en HTTP 403, ne sont plus exposées comme solution fiable dans l’interface.

## Session Google et historique YouTube

Depuis la version 2026-11-16, la connexion Google via token client est conservée temporairement dans `sessionStorage`, distincte par membre familial, ce qui évite la déconnexion lors d'un simple rafraîchissement du navigateur. **Ce n'est pas une connexion OAuth permanente :** les jetons expirent généralement après environ une heure et doivent être renouvelés par une action de l’utilisateur. L'application ne stocke ni `refresh_token` ni `client_secret` dans le navigateur. Pour une reconnexion multi-jours, il faudra une architecture serveur avec OAuth code flow, rafraîchissement et stockage sécurisé, soumise à la limite de 7 jours des refresh tokens en mode test Google.

L'API YouTube Data v3 **ne permet pas de lire l'historique YouTube d’un utilisateur** (`watchHistoryNotAccessible`), même avec `youtube.readonly`. Dans l'onglet Historique, un membre peut voir ses lectures JabouTube et importer son export Google Takeout `watch-history.json` après extraction depuis l'archive. Cette copie reste locale à ce membre et cet appareil ; elle n'est pas synchronisée avec YouTube.

## Import volumineux d'un historique YouTube (novembre 2026)

L'importeur accepte désormais jusqu'à **8 000 vidéos uniques** (et un JSON jusqu'à 25 Mo). Il reconnaît les exports originaux `watch-history.json` et les sauvegardes JabouTube `{history:[{id,title,author,watchedAt,watchCount}]}`. L'historique est trié par dernière date de visionnage, dédupliqué par ID vidéo, et affiché par pages de 80 vignettes pour préserver les performances. Les nouvelles vidéos ouvertes dans JabouTube ne tronquent plus cet historique à 600 éléments.

Chaque membre conserve son historique dans le stockage **local** de son navigateur, sans serveur de synchronisation. Les quotas de stockage locaux peuvent varier selon l'appareil ; une exportation de sauvegarde depuis Réglages reste conseillée.

## Fil d’accueil personnalisé avec chargement infini

La page **Accueil** n’est plus une rangée d’historique + tendances. Elle affiche un flux de recommandations publiques créé à partir des **préférences calculées localement** : sujets/titres des vidéos déjà ouvertes dans JabouTube, favoris et abonnements YouTube autorisés. Les tendances généralistes sont une solution de secours lorsque ces signaux sont absents. L’algorithme interne de YouTube n’est pas accessible et les suggestions produites ne sont **pas** les mêmes que celles de YouTube.

Chaque recherche charge jusqu’à environ 40 résultats par lot, avec défilement infini (IntersectionObserver) et bouton « Afficher plus » en repli. Les doublons sont filtrés, et les vidéos déjà vues récemment sont moins favorisées. Les recherches officielles utilisent YouTube Data API v3 lorsque le membre est connecté (limite de quota partagée), sinon recherche communautaire via le serveur, susceptible d’erreurs HTTP 403. Pour réduire les requêtes, le fil et ses pages sont mis en cache 20 minutes **par profil familial** dans sessionStorage. Aucun historique complet, adresse Gmail ou jeton Google n’est envoyé aux moteurs tiers ; les requêtes de sujets sont toutefois transmises aux fournisseurs de recherche. Les résultats ne sont pas synchronisés entre appareils.

Les anciennes vidéos regardées **en dehors** de JabouTube ne sont pas accessibles via l’API officielle. Une importation Google Takeout de l’historique, si souhaitée, enrichit immédiatement les préférences. Sans importation, les abonnements du compte Google et les vidéos regardées **dans JabouTube** permettent déjà un flux personnalisé qui s’affine avec l’usage.

## Import ZIP Google Takeout pour chaque membre familial

Dans l'onglet **Compte** (ou Historique / Réglages), le membre peut choisir directement son archive `.zip` Google Takeout, sans extraire manuellement `watch-history.json` et sans ChatGPT. La bibliothèque JSZip locale est distribuée sous licence MIT (voir `vendor/JSZip-LICENSE.txt`). Le navigateur extrait uniquement le fichier d’historique YouTube JSON ou HTML et importe les vidéos dédupliquées dans le stockage local séparé par identifiant de membre (maximum 8 000 vidéos uniques). L’archive n’est envoyée ni au serveur Render ni à d’autres fournisseurs.

**Ce n'est pas une connexion Gmail ni un transfert automatique de l'ancien historique** : Google Takeout impose la demande puis le téléchargement par le titulaire du compte. Une récupération complètement automatique nécessiterait Google Data Portability API et ses prérequis spécifiques (projet Cloud dédié, facturation, habilitation OAuth pour scope restreint, vérification). L'application familiale peut dès à présent apprendre automatiquement des vidéos regardées dans JabouTube et des abonnements connectés, sans ZIP.

## Écran verrouillé

Le bouton dans le lecteur vidéo transfère la vidéo officielle à l'application/site YouTube et conserve si possible la position. Le lecteur YouTube iframe ne devient pas un lecteur audio natif : la lecture écran éteint n'est pas garantie dans JabouTube et dépend des fonctions proposées par l’application YouTube, notamment Premium. L’intégration ZIP n'affecte pas cette limite.
