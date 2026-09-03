# Problème : précision de la réactivité audio en mode Spotify

## Contexte du projet

Scénographie WebGL (mur de caissons LED façon VU-mètre) qui doit réagir en
temps réel à la musique jouée depuis Spotify, dans un navigateur, sans
backend audio (le seul backend est une fonction serverless Vercel ajoutée
pour contourner du CORS, cf. plus bas). Stack : Vite + React + Three.js
(`@react-three/fiber`), Web Playback SDK Spotify.

Le mur affiche des colonnes façon analyseur de spectre : chaque colonne
correspond à une plage de fréquences, et son intensité/couleur dépend de
l'énergie mesurée dans cette plage à l'instant présent.

## Le blocage racine : Spotify a fermé l'accès au signal et à l'analyse

1. **Le signal audio lui-même n'est jamais accessible.** Le Web Playback SDK
   décode la piste derrière l'EME (DRM navigateur). Aucun navigateur ne
   permet à `Web Audio API` de lire ce flux — c'est une limitation
   plateforme, pas un manque de code.
2. **`GET /v1/audio-analysis/{id}`** (segments avec pitches/timbre/loudness
   par tranche de temps, beats/bars/tatums) et **`GET /v1/audio-features/{id}`**
   (tempo, energy, danceability, valence, acousticness, instrumentalness,
   speechiness, loudness, key, mode, time_signature — une seule valeur par
   morceau entier) ont été **dépréciés par Spotify le 27 novembre 2024**
   pour toute application créée après cette date. Réponse : 403 systématique.
   Seules les apps ayant déjà une extension de quota accordée/en attente
   avant cette date y ont encore accès — aucun recours pour une nouvelle app.
3. **Mai 2025** : l'Extended Quota Mode (qui aurait pu redonner accès à ces
   endpoints) exige désormais ~250k utilisateurs actifs mensuels avant
   étude du dossier — inaccessible à un projet indépendant.
4. **Février 2026** : nouvelles restrictions Developer Mode (compte Premium
   obligatoire, 5 utilisateurs de test max, un seul Client ID par
   développeur, endpoints supplémentaires restreints) — confirme que
   Spotify continue de refermer l'API, pas de signe d'assouplissement.

Sources vérifiées (recherche web, nov. 2024 → fév. 2026) : TechCrunch,
Musically, Techzine, communauté officielle Spotify for Developers.

## Ce qu'on a mis en place pour compenser (implémenté, dans ce repo)

### 1. Resynthèse procédurale (`src/audio/sources/spotifyTimelineSource.ts`)
Faute de signal réel, on **invente** un spectre plausible à partir des
métadonnées disponibles (tempo, energy, danceability, valence, acousticness,
instrumentalness, speechiness, loudness, key, mode) :
- Percussions synthétiques (kick/snare/hi-hat) calées sur le tempo réel.
- Nappe harmonique (série d'harmoniques sur la fondamentale déduite de
  `key`/`mode`).
- Paramètres qui modulent intensité, largeur de la nappe, inclinaison
  spectrale (tilt par valence), présence d'une bosse "voix" (speechiness).

**Limite fondamentale, pas contournable par plus de réglages** : ces
métadonnées sont des **scalaires statiques par morceau entier** (une seule
valeur pour 3 minutes de musique), jamais une timeline. Il est
mathématiquement impossible d'en tirer un contenu spectral qui varie
vraiment d'un instant à l'autre ou qui diffère structurellement d'un
morceau à l'autre au-delà de l'intensité/vitesse — le kick est toujours
placé dans la même plage de fréquences, la nappe harmonique aussi, quels
que soient les chiffres en entrée. **Le mur "ressemble à un mur" quel que
soit le morceau, malgré des données réelles en entrée**, parce que rien
ne dit *quand* et *où* dans le spectre le morceau a réellement de l'énergie
à un instant `t`.

### 2. Fallback multi-sources pour tempo/loudness/features
Spotify étant fermé, on va chercher les mêmes métriques ailleurs :

| Source | Endpoint | Auth | Couverture constatée | CORS navigateur |
|---|---|---|---|---|
| ReccoBeats | `GET https://api.reccobeats.com/v1/audio-features?ids=<spotifyId>` | Aucune | Trouve un hit ancien/mainstream ("Mr. Brightside", 2003) avec tous les champs remplis ; **ne trouve pas** un hit récent (2025) testé | Pas d'en-têtes CORS → proxy serveur obligatoire |
| Deezer | `GET https://api.deezer.com/search/track` puis `/track/{id}` | Aucune | `gain` (loudness) presque toujours présent ; `bpm` **souvent `null`** même quand le morceau est trouvé | Pas d'en-têtes CORS → proxy serveur obligatoire |

Les deux étant sans CORS, une **fonction serverless Vercel Edge**
(`api/track-features.ts`) fait le relais côté serveur (contournement
CORS uniquement, pas un vrai backend applicatif).

**Constat empirique (testé en prod)** : sur un échantillon de 2 morceaux,
ReccoBeats n'a couvert que le plus ancien. Sa base semble nettement plus
restreinte que le catalogue Spotify complet — cohérent avec le fait que
c'est un service tiers jeune (né de la fermeture Spotify fin 2024), pas
une base exhaustive.

### 3. Ce qui reste hors de portée sans signal réel
Aucune des sources ci-dessus ne fournit de **données temporelles**
(à quel instant tel son se produit). Impossible d'obtenir avec elles :
- la position exacte des transitoires (onsets) autres que la grille de
  beats calculée depuis le tempo (donc rythmiquement correcte mais
  "vide" de tout contenu réel entre deux temps) ;
- le contenu harmonique réel joué à un instant donné ;
- toute variation de texture en cours de morceau (intro calme → refrain
  saturé, etc.) — une seule valeur `energy` moyenne sur 3 minutes ne peut
  pas représenter ça.

## Ce qui marche déjà à ~95-100% (mais pas dans ce fil de discussion)

**Capture d'onglet réelle** (`src/audio/sources/captureSource.ts`,
`getDisplayMedia` avec option audio) : capture le son réellement produit
par l'onglet (donc le flux Spotify décodé, après l'EME, au niveau du
mixage audio du navigateur) → vraie FFT, vraie précision. Limite : exige
un geste utilisateur explicite et une boîte de dialogue native du
navigateur à chaque session (impossible à automatiser ou pré-valider par
script, c'est une protection anti-espionnage du navigateur, pas
contournable côté client quel que soit le navigateur).

## Pistes non explorées / à rechercher

1. **`preview_url` de `GET /v1/tracks/{id}`** (endpoint non restreint par
   les fermetures de nov. 2024) : Spotify fournit parfois un extrait MP3
   de 30s. Si disponible, on pourrait le télécharger et faire une vraie
   analyse audio côté client (Web Audio, décodage réel, détection de
   tempo par autocorrélation, énergie/brillance par FFT) — donnerait un
   vrai signal, pas une resynthèse. **Non vérifié** : Spotify retire de
   plus en plus souvent ce champ (souvent `null` pour les nouveautés/gros
   labels) ; fiabilité et couverture inconnues sans test empirique.
2. **Autres bases de données audio-features publiques** que ReccoBeats/
   Deezer/GetSongBPM, avec une meilleure couverture du catalogue actuel
   et si possible des données *segmentées dans le temps* (pas juste des
   moyennes par morceau) — c'est le vrai chaînon manquant.
3. **Modèle d'analyse audio embarqué** (ex. essentia.js en WASM) appliqué
   à un extrait réel (preview_url ou capture d'onglet) plutôt qu'à des
   métadonnées — déplace le problème vers "a-t-on un extrait audio réel
   à donner au modèle", donc dépend du point 1.
4. Confirmer s'il existe un service tiers légal avec une **couverture de
   catalogue proche de Spotify** (pas juste les gros titres) tout en
   restant dans un usage conforme aux CGU de la source de données.

## Résumé en une phrase

Le plafond n'est pas un problème de code : c'est l'absence de toute
source légale, exhaustive et **temporelle** (pas juste des moyennes par
morceau) pour ce que Spotify a fermé — tant qu'on reste sur "connexion
Spotify pure" sans capturer le signal réel, la variation obtenue restera
paramétrique (intensité/vitesse) et non structurelle (quel contenu, à
quel instant).
