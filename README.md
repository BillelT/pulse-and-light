# PULSE & LIGHT — Scénographie audio-réactive WebGL

Un mur de caissons lumineux — treize colonnes de VU-mètres LED en arc — qui
réagit en temps réel à la musique jouée depuis Spotify.

Référence visuelle : `ref.jpg`. Cahier des charges : `Brief_Projet_WebGL_AudioReactive.md`.

---

## Démarrage

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

La scène démarre vivante, sans écran intermédiaire : au chargement elle tourne
sur une **source procédurale à 124 BPM**, qui n'ouvre ni `AudioContext` ni
capture et ne demande donc aucune autorisation. Le panneau de droite sert à
brancher une vraie source quand on en veut une.

Autres commandes :

```bash
npm run build        # typecheck + bundle de production dans dist/
npm run preview      # sert le build
npm run typecheck    # tsc -b seul
```

---

## Connecter Spotify

1. Crée une app sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
2. Dans ses *Settings*, ajoute exactement cette **Redirect URI** :
   `http://127.0.0.1:5173/callback`
   (Spotify refuse `localhost` depuis 2025 : il faut l'IP.)
3. `cp .env.example .env`, colle le **Client ID**, relance `npm run dev`.

Aucun client secret n'est nécessaire : l'authentification utilise
**Authorization Code + PKCE**, entièrement côté navigateur. Les tokens vivent
dans le `localStorage` et sont rafraîchis automatiquement.

La lecture *dans* la page (Web Playback SDK) demande un compte **Premium** —
c'est une contrainte de Spotify, pas du projet. Avec un compte gratuit, la
connexion reste utile pour les métadonnées : lance la musique depuis l'app
Spotify et choisis la capture d'onglet ou le micro comme source.

---

## Les quatre sources audio, et pourquoi il en faut plusieurs

Le Web Playback SDK décode sa piste derrière l'**EME (DRM)**. Ce flux n'est
accessible depuis la Web Audio API dans **aucun** navigateur : y brancher un
`AnalyserNode` renvoie du silence. Aucune astuce ne contourne ça — c'est le but
du dispositif. Il faut donc soit capter le son en sortie, soit reconstruire le
spectre à partir d'autre chose.

| Source | Donnée | Quand l'utiliser |
| --- | --- | --- |
| **Audio de l'onglet** | FFT réelle sur le son joué | Le meilleur rendu. `getDisplayMedia` : choisis l'onglet Spotify et coche *Partager l'audio de l'onglet*. Chrome / Edge. |
| **Timeline Spotify** | Spectre reconstruit | Piloté par la position de lecture. Si `/audio-analysis` répond, le spectre est synthétisé segment par segment (`pitches`, `timbre`, `loudness`) sur la grille de `beats` — calé sur le morceau, note par note. Sinon, grille rythmique dérivée du tempo. |
| **Micro** | FFT réelle | Marche partout, y compris sur une enceinte physique. Le micro colore le spectre et capte la pièce. |
| **Fichier local** | FFT réelle | Chemin de secours sans compte ni permission particulière. |

Les quatre alimentent **exactement le même moteur d'analyse** : elles
implémentent l'interface `SpectrumProvider` et rien en aval ne sait laquelle est
active.

> **Note sur les endpoints d'analyse.** Spotify a restreint `/audio-features` et
> `/audio-analysis` fin 2024 : une app créée depuis reçoit un `403`. Le code
> traite ce cas comme normal, pas comme une erreur, et bascule sur la grille
> rythmique. Le panneau Spotify indique quel chemin est actif pour la piste
> courante.

---

## Ce que fait le moteur d'analyse

`src/audio/AudioEngine.ts` transforme un spectre brut en données
scénographiques, à **125 Hz sur son propre timer** — indépendamment du rendu.
C'est délibéré : à 128 BPM un kick tombe toutes les 470 ms, et une analyse calée
sur `useFrame` rate des kicks dès que la scène descend sous 30 fps.

- **Six bandes** (`src/audio/bands.ts`), conformes au tableau du brief :
  sub 20–60 Hz, basses 60–250, low-mids 250–500, mids 500–2 k, high-mids 2–4 k,
  aigus 4–16 k.
- **Réponse logarithmique** — `I = log₁₀(1 + A·K) / log₁₀(1 + K)`, puis fenêtrage
  entre un plancher et un plafond réglables (la perception du volume est
  logarithmique, et les masterings n'ont pas tous la même dynamique).
- **Lissage asymétrique** indépendant du framerate : `α = 1 − e^(−Δt/τ)`, avec
  une constante de montée courte et une constante de descente longue. C'est ce
  qui évite l'effet stroboscopique d'une FFT brute suivie à 60 fps.
- **Détection de transitoires sur la dérivée** de l'énergie basse, seuil
  adaptatif en *k·σ*. Seuiller l'énergie elle-même ne marche pas : dès qu'un
  morceau porte une basse continue, le plancher monte et le kick ne dépasse plus
  la moyenne glissante. C'est la *montée* qui distingue une attaque d'un fond
  soutenu.
- **Tempo** estimé par médiane des intervalles entre onsets, replié dans
  70–180 BPM — ou lu directement si Spotify le fournit.
- **Treize colonnes** réparties logarithmiquement de 30 Hz à 14 kHz, avec
  compensation de pente (sans elle, les colonnes d'aigus restent éteintes).
- **Flux spectral** et **centroïde** comme descripteurs de timbre.

Vérifié sur des signaux de test à 96, 128 et 150 BPM avec basse continue :
tempo détecté à ±1 BPM.

---

## La scène

Trois `InstancedMesh` seulement pour tout le mur — cellules LED, corps, châssis —
soit trois *draw calls*, ce qui laisse le budget au bloom.

- **Colonnes LED.** Le pas des cellules est constant sur tout le mur : les
  colonnes hautes en contiennent simplement davantage, comme sur la référence.
  Une cellule éteinte est **gris foncé neutre**, jamais teintée : la couleur
  n'apparaît qu'à l'allumage.
- **La couleur vient de la fréquence, jamais du hasard.** Chaque colonne mesure
  une bande log-fréquentielle précise (`src/audio/columns.ts`, partagé avec le
  moteur) et en tire sa teinte via le tableau de la partie 1 du brief : graves
  vers le rouge, aigus vers le bleu. La rampe de VU-mètre ne fait que tempérer
  cette teinte selon le niveau atteint. Deux écoutes du même passage donnent
  exactement la même image.
  Le mélange se fait en **HSL par le plus court chemin sur la roue chromatique** :
  un `lerp` RGB entre deux teintes saturées passe par le gris, et le `lerpHSL`
  de three interpole la teinte linéairement — passer du magenta au vert
  traversait alors le cyan, et une colonne verte devenait cyan à son sommet.
- **Caissons de basses.** Deux stacks latéraux dont les membranes avancent
  physiquement sous 100 Hz. Seul élément de la scène qui bouge en translation,
  donc seul porteur de la sensation de pression.
- **Sol.** `MeshReflectorMaterial`, volontairement mat côté PBR : la réflexion
  vient du miroir, pas du lobe spéculaire, sinon chaque projecteur laisse une
  pastille brillante au milieu du plateau.
- **Retombée de lumière.** Cinq projecteurs accrochés au-dessus du mur
  reprennent la couleur moyenne des colonnes voisines et éclairent réellement le
  sol et la régie.
- **Brume violette et légère.** Une brume noire ne matérialise rien : elle se
  contente d'effacer la scène dès qu'on recule d'un mètre. Une brume teintée et
  peu dense laisse lire la profondeur tout en donnant du volume aux faisceaux.
- **Nez de scène lumineux.** La bande est portée par une face **verticale** et
  non couchée sur le sol : une bande horizontale de quelques centimètres, vue en
  incidence rasante, se réduit à une ligne d'un pixel qui scintille et bave sur
  toute la largeur de l'image.
- **Post-processing.** Bloom (c'est lui qui transforme des boîtes émissives en
  néon), aberration chromatique pilotée par les sub-basses, grain piloté par le
  timbre, vignettage, tone mapping *Khronos PBR Neutral* — ACES tire les
  couleurs saturées vers le blanc, ce qui tue le néon.
- **L'opérateur** est un vrai rig hiérarchique — bassin › buste › tête, épaule ›
  coude, hanche › genou — et non un tas de primitives indépendantes : une
  rotation de bassin entraîne tout le haut du corps. Sa phase de danse avance en
  **battements par seconde** (BPM/60), donc le rebond tombe sur le temps quel que
  soit le tempo. Il descend sur le kick plutôt que de monter : un rebond vers le
  haut se lit comme un sursaut, pas comme une danse.
- **Caméra** maison plutôt qu'`OrbitControls`, pour pouvoir superposer un
  mouvement automatique et un *shake* sur les kicks sans que le contrôleur ne
  les écrase. Glisser = orbiter, molette = zoom.

---

## Le panneau « Lumière »

La partie 3 du brief liste les trous volontaires de la science. Ils sont tous
exposés comme réglages, et relus à chaque tick :

- **Seuils** — gain *K*, plancher de bruit, plafond de clipping.
- **Amortissement** — attaque, decay, sensibilité et temps réfractaire du kick.
- **Palette** — quatre palettes (dont *Arcade*, calée sur `ref.jpg`), poids de
  la couleur de fréquence face à la rampe de niveau, teinte tonale de Scriabine,
  aplats ou dégradé.
- **Rendu** — bloom, aberration, grain, brume, shake, nombre de cellules,
  peak-hold, caméra automatique.

---

## Architecture

```
src/
  audio/
    AudioEngine.ts             bandes, lissage, onsets, BPM, timbre
    bands.ts                   découpage fréquentiel du brief
    columns.ts                 découpage des colonnes, partagé moteur / scène
    engine.ts                  instance unique (hors React)
    useAudioSource.ts          cycle de vie de la source active
    sources/                   AnalyserNode, capture onglet/micro, fichier, timeline Spotify
  spotify/
    auth.ts / pkce.ts          Authorization Code + PKCE
    api.ts                     Web API, dégradation propre sur 403
    useSpotify.ts              Web Playback SDK, horloge de lecture
  scene/
    CaissonWall.tsx            le mur (3 draw calls)
    Dancer.tsx                 l'operateur, rig hierarchique cale sur les temps
    SubCabinets.tsx            caissons de basses à membranes
    Stage.tsx                  sol, podium, régie
    Rig.tsx                    caméra + éclairage
    Effects.tsx                chaîne de post-processing
    layout.ts / palettes.ts    implantation et couleurs
  ui/                          HUD, analyseur, panneau de contrôle
  state/store.ts               réglages et état de lecture (zustand)
```

Les données audio ne transitent **jamais** par un state React : le moteur est un
singleton lu directement dans `useFrame` et dans un `requestAnimationFrame`
dédié pour l'analyseur du HUD. Un re-render par frame sur tout l'arbre coûterait
plus cher que le rendu lui-même.

---

## Limites connues

- La lecture in-app exige Spotify **Premium**.
- La capture d'onglet demande Chrome ou Edge ; Firefox et Safari n'exposent pas
  l'audio d'onglet via `getDisplayMedia`.
- La source « timeline Spotify » ne produit pas un spectre *mesuré* mais
  *reconstruit* : le rythme est juste, le contenu harmonique est fidèle quand
  l'Audio Analysis répond, simulé sinon. Pour une réactivité mesurée, utiliser la
  capture d'onglet.
