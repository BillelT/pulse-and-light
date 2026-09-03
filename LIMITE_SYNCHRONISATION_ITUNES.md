# Limite résiduelle : désynchronisation temporelle de l'extrait iTunes

## Contexte (ce qui est déjà en place et fonctionne)

Le mur audio-réactif (`pulse-and-light`) est piloté en mode Spotify par le
pipeline suivant (implémenté, en prod) :

```
Piste Spotify (id, ISRC via /v1/tracks/{id}, artiste, titre, durée)
  → /api/itunes-preview (Vercel Edge Function)
  → iTunes lookup par ISRC, sinon recherche artiste+titre scorée
  → previewUrl (extrait audio MP3/AAC, 30s, catalogue iTunes)
  → <audio> + MediaElementAudioSourceNode + GainNode (atténuation ×0.4)
  → AnalyserNode (vraie FFT)
  → AudioEngine (bandes de fréquences, colonnes du mur, détection d'onset, BPM)
```

Ce pipeline remplace une resynthèse procédurale (spectre inventé à partir de
scalaires statiques par morceau — tempo/energy/valence/etc., cf.
`PROBLEME_DATA_AUDIO.md`) par une vraie analyse fréquentielle d'un signal
audio réel, sans jamais router cet extrait vers les enceintes (il n'est
jamais entendu — seul Spotify l'est).

Deux défauts déjà corrigés :

1. **Saturation quasi permanente** : les extraits iTunes sont masterisés
   très fort (loudness proche de 0 dBFS) → un `GainNode` (×0.4) ramène le
   niveau dans une plage comparable aux autres sources réelles du projet
   (capture micro/onglet), sur lesquelles le reste du moteur (seuils, gain
   du "Lighting Designer") est calibré.
2. **Intro/outro trop forts** : un fondu artificiel (4s) est appliqué sur le
   spectre analysé, calé sur `positionSec`/`durationSec` — des données
   Spotify réelles et fiables (contrairement au contenu spectral lui-même).

## Le problème qui reste : désynchronisation structurelle, pas juste aux bords

L'extrait iTunes est un passage **fixe** de ~30s du morceau (souvent le
refrain — la section la plus représentative/vendeuse), lu **en boucle sur
son propre timer**, sans aucun lien avec la position réelle de lecture
Spotify (`positionSec`).

Le fondu ne corrige que les deux extrémités du morceau (premières/dernières
secondes). Mais un morceau a d'autres moments de plus faible énergie en plein
milieu — pont, break, couplet calme avant un refrain, outro instrumentale qui
commence bien avant la fin chronométrique — qui ne sont matérialisés nulle
part dans les données dont on dispose (`positionSec`/`durationSec` seuls ne
disent pas "on est dans un couplet calme à 1:47").

**Résultat concret** : à ces moments-là, l'extrait bouclé peut très bien être
en train de rejouer son propre passage fort (le refrain qu'il contient),
pendant que le vrai morceau, sur Spotify, est calme. Le mur reste alors trop
énergique par rapport à ce que l'auditeur entend réellement — un
désalignement que rien dans l'architecture actuelle ne peut détecter ni
corriger, puisqu'on n'a **aucune donnée sur le contenu temporel du morceau
réel au-delà de sa durée totale**.

## Pourquoi c'est structurellement difficile (pas juste un bug à corriger)

Le nœud du problème : on n'a **jamais accès simultanément** aux deux choses
qu'il faudrait pour se resynchroniser :

- Le signal audio réel de Spotify, à l'instant `t` — bloqué par l'EME (DRM)
  du Web Playback SDK, sauf capture d'onglet (`getDisplayMedia`), qui elle
  fonctionne parfaitement mais exige une boîte de dialogue navigateur
  anti-espionnage à chaque session (frottement UX jugé inacceptable pour ce
  projet, cf. `PROBLEME_DATA_AUDIO.md`).
- Une timeline énergie/structure du morceau entier (couplet/refrain/pont,
  ou juste une courbe de loudness dans le temps) — c'est exactement ce que
  fournissait `audio-analysis`/`audio-features`, fermé par Spotify fin 2024
  (le point de départ de tout ce fil de recherche).

Sans l'un des deux, il est mathématiquement impossible de savoir "à quel
instant du morceau réel on se trouve, structurellement" pour recaler
l'extrait en conséquence. On peut mesurer la position en secondes
(`positionSec`), mais pas ce qui s'y joue.

## Pistes déjà écartées ou hors de portée

- **Réanalyser l'extrait iTunes lui-même pour en détecter la structure**
  (ex. où sont les refrains dans les 30s) ne sert à rien : le problème n'est
  pas de comprendre l'extrait, mais de savoir où on en est dans le morceau
  **complet**, que l'extrait ne couvre pas.
- **Cross-corrélation extrait ↔ signal réel** : impossible sans accès au
  signal réel (le problème de départ).
- **Étirer/repositionner l'extrait pour qu'il corresponde à `positionSec`**
  n'a pas de sens : l'extrait ne fait que 30s sur un morceau de 3-4 minutes,
  et rien n'indique à quel instant du morceau complet il correspond (Apple
  ne documente pas où il découpe l'extrait).

## Pistes non vérifiées, à rechercher (objet de ce document)

1. **Une source de données de structure/loudness temporelle, gratuite ou peu
   chère, couvrant un catalogue large** (l'équivalent de l'ancien
   `audio-analysis` Spotify) — via ISRC ou artiste/titre. Candidats à
   vérifier : AcousticBrainz (semble à l'arrêt), Essentia/essentia.js
   appliqué à quoi (voir point 2), API commerciales (Cyanite.ai, Musiio,
   SoundCloud API, Deezer étendu) — couverture et coût inconnus.
2. **Modèle d'analyse structurelle embarqué (WASM) appliqué à l'extrait
   iTunes lui-même**, pour au moins savoir "l'extrait que j'ai est-il une
   section calme ou intense dans l'absolu" et moduler le gain en
   conséquence — n'aide pas à savoir où on est dans le morceau réel, mais
   pourrait éviter de rejouer bêtement un extrait "fort" comme une boucle
   plate ; à évaluer si ça vaut le coût de complexité.
3. **Données de paroles synchronisées (ex. Musixmatch richsync/LRC)** comme
   proxy indirect de structure (couplet = texte dense, refrain = répétitions,
   instrumental = silence de paroles) — hack créatif, fiabilité et
   couverture inconnues, et ne couvre pas les morceaux instrumentaux.
4. **Accepter la limite** et la rendre moins visible : plutôt que d'essayer
   de deviner la structure réelle, mélanger progressivement l'extrait iTunes
   réel avec la resynthèse procédurale existante (qui elle suit au moins le
   tempo/l'energy globale du morceau) pour amortir les écarts les plus
   extrêmes, sans prétendre à une synchronisation qu'on n'a pas les moyens
   d'obtenir.
5. **Confirmer s'il existe un moyen légal d'obtenir un extrait iTunes plus
   long, ou positionné différemment** (ex. paramètre non documenté de l'API
   iTunes Search/Lookup) — peu probable mais à vérifier.

## Résumé en une phrase

Le fondu intro/outro corrige ce qu'on peut corriger avec des données
fiables (position/durée réelles) ; la désynchronisation en milieu de morceau
est un problème d'absence de donnée (aucune timeline du morceau réel n'est
accessible, ni côté Spotify — fermé — ni côté iTunes — extrait fixe de 30s),
pas un bug de calibration : sans nouvelle source de données temporelles ou
sans capturer le signal réel (capture d'onglet), il n'y a pas de fix propre,
seulement des atténuations du symptôme.
