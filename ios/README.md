# JabouTube iOS natif — prototype de lecture audio

Ce dossier contient une **application iOS native** (SwiftUI + WKWebView + AVPlayer), distincte du site/PWA JabouTube et de l’APK Android. Le navigateur continue d'afficher le site JabouTube existant et chaque membre peut saisir son lien d'invitation familial via **Lien familial**.

## Lecture écran verrouillé

L'app configure `AVAudioSession` avec la catégorie `.playback`, déclare `UIBackgroundModes = audio` et utilise `AVPlayer` ainsi que `MPRemoteCommandCenter`. Quand le site est ouvert **dans cette app native**, le bouton **♫ Audio écran verrouillé · iOS natif** envoie à l’app l'ID de la vidéo, le titre et la position courante. L’app demande les formats audio au serveur familial, via l'identifiant de session temporaire, puis essaie de jouer un URL audio HTTPS compatible AAC/MP4.

**Limites majeures :** l’API du lecteur intégré YouTube n’offre pas de lecture audio écran verrouillé. L’API `/api/streams/...` dépend de services communautaires non garantis : elle peut être indisponible (HTTP 503), bloquée (403), renvoyer des URL expirées ou des formats non pris en charge. Ce prototype ne constitue donc pas une correction validée pour toutes les vidéos YouTube et peut entrer en conflit avec les règles de YouTube. La lecture n’est pas garantie avant test avec un vrai iPhone. Les contenus directement autorisés ou indépendants de YouTube restent une alternative plus robuste pour la lecture native.

## Connexion et confidentialité

Le site JabouTube s’ouvre dans le `WKWebView`, isolé du Safari habituel. Un membre doit donc **coller une première fois son propre lien d’invitation familial** depuis le menu `Lien familial`. La session est ensuite conservée dans le stockage WebKit de l’application. Lors d’une lecture native, l’app utilise ce jeton exclusivement pour obtenir les métadonnées vidéo depuis le serveur, sans l'envoyer au service audio externe. La connexion OAuth Google depuis un navigateur incorporé peut être refusée par Google et nécessiter plus tard un parcours d'authentification natif séparé.

## Compilation

Le workflow GitHub Actions `.github/workflows/jaboutube-ios-native.yml` génère un projet Xcode avec XcodeGen et compile une application iOS non signée :

- Ouvrir **Actions → JabouTube iOS Native IPA (experimental)**.
- Sélectionner le dernier build réussi et télécharger l'artefact `JabouTube-iOS-unsigned-IPA`.
- **Signer** l'IPA à l'aide d’un compte Apple et d’un outil de signature/sideload compatible avant de l’installer, ou construire et signer le projet sur un Mac avec Xcode. Un IPA non signé n'est pas installable tel quel.

L’application ne comporte actuellement aucun certificat ou profil de signature Apple. L’installation et les tests audio sur iPhone ne sont pas encore validés.
