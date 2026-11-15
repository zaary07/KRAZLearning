# JabouTude — PWA iOS inspirée de ReVanced

Application Web indépendante (HTML/CSS/JavaScript) conçue pour iPhone/iPad et ordinateur. Installation via Safari > Partager > Sur l'écran d'accueil.

## Fonctions
- Deux sections : vidéos et musique ; recherche, tendances en France.
- Lecteur vidéo/audio natif (flux publics fournis par des API d'instances Piped), choix d'instance.
- Favoris et historique enregistrés localement, partage, sauvegarde et import JSON, dont watch-history.json de Google Takeout.
- Web App installable (manifest, service worker), sans annonces ajoutées par l'application.
- **Pas de connexion à un compte Google**, pas de synchronisation du véritable historique YouTube. Ne pas entrer son mot de passe Google dans les instances tierces. L'API YouTube ne fournit pas l'historique complet.
- La disponibilité et la compatibilité des flux HLS/muxés sont dépendantes de fournisseurs communautaires non officiels. Certains peuvent être inopérants, bloqués par YouTube ou incompatibles avec Safari. Pas de garantie d'absence de toutes les annonces contenues dans la vidéo.
- Pas de contournement DRM ; pas d'hébergement ou de redistribution de vidéos.

Sources des API Piped : https://docs.piped.video/docs/api-documentation/
Licence de cette implémentation : MIT. JabouTude n'est affilié ni à ReVanced ni à YouTube.
