# Audit technique — Pulse & Light

Périmètre : moteur d'analyse audio (`src/audio/`), pipeline de sources
(micro / onglet / fichier / Spotify), et tout ce qui conditionne la fidélité
de la réaction lumineuse au son réellement joué.

Légende de sévérité :
- 🔴 **Bloquant** — casse la promesse produit (« la lumière suit le son »).
- 🟠 **Important** — dégrade la qualité perçue ou la robustesque.
- 🟡 **Mineur** — amélioration, dette, confort de dev.

---

## 🔴 1. La source « Timeline Spotify » ne lit quasiment jamais le vrai contenu du morceau

**Constat.** `src/spotify/api.ts:101-131` documente explicitement que
`/v1/audio-features/{id}` et `/v1/audio-analysis/{id}` renvoient **403** pour
toute application Spotify créée après fin 2024. Le code gère l'erreur
proprement (`catch` → `null`), mais la conséquence en aval n'est pas anodine :

- `useSpotify.ts:104-137` (`loadTrackAnalysis`) publie alors des valeurs
  **par défaut identiques pour toutes les pistes** :
  `energy: 0.6, danceability: 0.6, valence: 0.5, key: -1, tempo: 0` (voir
  `EMPTY_SNAPSHOT`, `spotify/types.ts:89-102`).
- `spotifyTimelineSource.ts:145-177` (`renderFromGrid`, le chemin de repli)
  synthétise alors un spectre à partir de **ces mêmes constantes
  génériques** : tempo par défaut 120 BPM, tonalité La (`key=0` faute de
  mieux), énergie/danceabilité toujours à 0.6/0.6.

**Effet observable.** Deux morceaux de styles, tempos et notes totalement
différents produisent, via l'intégration Spotify native, un **spectre
synthétique quasi identique** (même grille rythmique fictive, même profil
harmonique). C'est exactement le symptôme rapporté : « 2 musiques
différentes ressortent pareil en lumière ».

**Ce qui marche vraiment.** Le chemin `renderFromAnalysis` (segments +
pitches + timbre note par note, `spotifyTimelineSource.ts:93-143`) est
réellement fidèle au morceau — mais il ne s'active **jamais** en pratique
puisque `/audio-analysis` est bloqué. Le seul chemin garanti fidèle
aujourd'hui est la capture réelle (`AnalyserProvider` via `captureSource.ts`
— micro ou audio d'onglet), qui n'a pas ce problème car c'est une vraie FFT
sur le signal réel.

**Recommandations.**
1. Court terme : rendre le statut « Procédural / grille générique » beaucoup
   plus visible dans le HUD principal (pas seulement dans l'onglet Source),
   avec une incitation claire à basculer sur « Audio de l'onglet » dès qu'une
   source Spotify est active sans capture.
2. Moyen terme : dans `renderFromGrid`, dériver une variation déterministe
   par piste (hash de `track.id` → décalage de phase, pondération
   d'harmoniques, palette de percussions) pour au moins **différencier**
   visuellement deux morceaux, même sans données Spotify réelles. Ne résout
   pas le fond du problème mais casse l'effet « toujours pareil ».
3. Plus robuste : encourager/automatiser la capture d'onglet comme source
   par défaut dès qu'un compte Spotify est connecté et qu'un onglet Spotify
   est détectable, plutôt que de laisser la Timeline Spotify comme choix par
   défaut apparemment équivalent.

---

## 🟠 2. Le tempo par défaut (120 BPM) et la tonalité par défaut faussent le rythme perçu

**Constat.** Quand `features` est `null` (donc systématiquement, cf. §1),
`snap.tempo` vaut `0` (`useSpotify.ts:124`), et `spotifyTimelineSource.ts:148`
retombe sur `bpm = 120`. Idem pour `key: -1 → root = 55 * 2**0 = 55 Hz`
(`spotifyTimelineSource.ts:167`). Ce n'est pas seulement l'harmonique qui est
fausse : le **calage rythmique** (kicks, danseur `Dancer.tsx:49`, shake
caméra) est lui aussi verrouillé sur un tempo arbitraire dès qu'aucune donnée
n'est disponible, ce qui peut créer un dé-phasage visible entre le rythme
réel du morceau et le rebond de la scène.

**Recommandation.** Estimer un tempo par onset detection même en mode
Timeline Spotify (le moteur le fait déjà pour les sources réelles via
`AudioEngine.detectOnset` / `estimateBpm`) plutôt que de figer 120 BPM — ou,
a minima, afficher clairement que le tempo est une valeur par défaut et non
mesurée.

---

## 🟠 3. Détection d'onset : un seul chemin (basses), donc aveugle aux genres sans kick marqué

**Constat.** `AudioEngine.detectOnset` (`AudioEngine.ts:263-322`) ne regarde
que `bandsRaw[Sub]*0.65 + bandsRaw[Bass]*0.35`. C'est un choix pertinent pour
de la musique à kick franc (house, techno, hip-hop), mais pour un morceau
sans grosse énergie basse marquée (acoustique, jazz, ambient, a cappella),
`onset` peut ne quasiment jamais se déclencher : pas de flash, pas de
danseur qui accentue, pas de shake caméra — la scène paraît "morte" alors
que la musique a un rythme perceptible ailleurs dans le spectre (transitoires
médium/aigu, percussions légères).

**Recommandation.** Ajouter un second détecteur basé sur le flux spectral
large bande (`this.flux`, déjà calculé `AudioEngine.ts:257`) en secours
quand l'énergie basse reste plate sur une fenêtre donnée, avec un seuil plus
permissif. Le mélange kick-only / flux-based pourrait être piloté par un
réglage exposé dans le Lighting Designer plutôt que codé en dur.

---

## 🟡 4. `beatCooldown` fixe (0.16 s) plafonne le tempo perçu à ~375 BPM, ok pour la plupart des styles mais rigide

Pas bloquant (la plage musicale usuelle est couverte), mais à noter : sur un
genre très rapide (gabber, breakcore > 180 BPM réels doublés), le cooldown
peut fusionner deux onsets distincts. `beatSensitivity`/`beatCooldown` sont
déjà exposés dans `AnalysisSettings` — s'assurer qu'ils sont bien réglables
depuis l'UI (Lighting Designer) et pas seulement en dur dans
`DEFAULT_ANALYSIS`.

---

## 🟡 5. `estimateBpm` : repli d'octave arbitraire (70–180 BPM)

`AudioEngine.ts:356-359` replie tout BPM détecté dans `[70,180]` en
doublant/divisant par 2. C'est une heuristique correcte pour la majorité des
morceaux dance/pop, mais peut donner un tempo « à l'octave près » erroné
pour un morceau réellement à 60 ou à 200 BPM stable (il sera reployé à
120/100 au lieu d'être affiché tel quel). Impact mineur car le tempo n'est
utilisé ici que pour caler des animations, pas affiché comme donnée fiable
au spectateur — mais vaut la peine d'être documenté comme limite connue.

---

## 🟡 6. Robustesse de la capture d'onglet / micro

`captureSource.ts` désactive `echoCancellation`/`noiseSuppression`/
`autoGainControl` — bon choix pour préserver la dynamique. Points de
vigilance non bloquants :
- Aucune détection explicite si l'utilisateur partage le mauvais onglet
  (silence prolongé) : `audioError` ne se déclenche que sur refus de
  permission, pas sur "onglet partagé mais silencieux". Un indicateur "aucun
  signal détecté depuis Xs" aiderait au diagnostic utilisateur.
- Le micro capte la pièce, donc toute réverbération / bruit ambiant biaise
  l'analyse — déjà documenté dans le hint UI (`SourceTab.tsx:52-54`), c'est
  correctement communiqué.

---

## 🟡 7. `AudioEngine` : couplage implicite au framerate d'appel

`update(dt)` est prévu pour être appelé à ~125 Hz par `AudioDriver` (mention
dans le commentaire `AudioEngine.ts:38`) mais rien ne garantit ni ne vérifie
ce contrat dans le code de l'engine lui-même — un changement futur de la
fréquence d'appel changerait silencieusement la fenêtre `HISTORY` (1.5s) et
donc la sensibilité de la détection adaptative. À documenter en commentaire
sur `AudioDriver` ou à rendre `HISTORY` dépendant d'une durée réelle plutôt
que d'un nombre de ticks fixe.

---

## Synthèse — ordre de traitement recommandé

| # | Sujet | Sévérité | Effort estimé |
|---|-------|----------|----------------|
| 1 | Fidélité de la source Spotify (grille générique) | 🔴 | Moyen (UX) → Élevé (variation par piste) |
| 2 | Tempo/tonalité par défaut figés en mode Timeline | 🟠 | Faible/Moyen |
| 3 | Onset uniquement basses, aveugle sur certains genres | 🟠 | Moyen |
| 4 | Cooldown onset fixe | 🟡 | Faible |
| 5 | Repli d'octave BPM | 🟡 | Faible (documentation) |
| 6 | Détection "signal silencieux" en capture | 🟡 | Faible |
| 7 | Couplage implicite au framerate d'appel de l'engine | 🟡 | Faible |

Le point **#1 est la cause directe** du symptôme signalé par l'utilisateur et
mérite d'être traité en premier.
