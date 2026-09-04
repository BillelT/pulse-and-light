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
>
> **Note sur la recherche.** Depuis la migration Web API de février 2026,
> `/search` plafonne le paramètre `limit` à `10` (défaut `5`, contre `50`/`20`
> avant) : au-delà, l'API renvoie un `400 "Invalid limit"`. `searchTracks`
> (dans `spotify/api.ts`) clampe donc `limit` à `[1, 10]` avant l'appel.

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
  haut se lit comme un sursaut, pas comme une danse. Son **corps**, lui, est
  volontairement réduit à des volumes simples (capsules, une sphère pour la
  tête, aucun visage) : à sa taille à l'écran, le détail se lit comme de la
  salissure, pas comme un personnage.
- **Caméra** maison plutôt qu'`OrbitControls`, pour pouvoir superposer un
  mouvement automatique et un *shake* sur les kicks sans que le contrôleur ne
  les écrase. Glisser = orbiter, molette = zoom.

---

## La DA « ink » (mode par défaut)

La scène est redessinée comme un croquis à l'encre : papier blanc, trait fin,
presque aucun aplat. **La seule couleur de l'image est celle qu'émettent les
cellules LED** — ce qui est coloré, c'est ce qui sonne.

Rien n'est stylisé « par-dessus » une image colorée : l'image est *redessinée*.

- **Toutes les surfaces sont aplaties en blanc** (`InkSurfaces.tsx`), sans
  lumière ni ombre. Un croquis n'a qu'un remplissage, le papier ; dupliquer
  chaque matériau du décor en version encre (le danseur seul en compte une
  vingtaine) n'aurait servi à rien. Deux exceptions, marquées par
  `material.userData.inkKeep` : les cellules LED, et les textures qui peignent
  déjà de l'encre.
- **Le trait est déduit de la profondeur et des normales** (`InkEffect.tsx`) :
  un saut de profondeur donne une silhouette, un saut de normale une arête —
  y compris quand les deux faces sont à la même distance de la caméra. Sa
  largeur est constante **en pixels** : un stylo ne s'affine pas parce que
  l'objet est loin. Les points d'échantillonnage sont décalés par un bruit
  lisse, ce qui suffit à casser l'aspect vectoriel.
  La sensibilité aux normales est volontairement basse : une surface *courbe*
  (membrane, épaule du danseur) fait varier sa normale continûment et se
  noircissait de traits jointifs, alors qu'une arête franche passe largement le
  seuil.
- **Le critère de contour est la courbure rapportée à la pente**, pas le
  gradient de profondeur. Un gradient dépend de tout — distance, angle
  d'incidence, amplitude du saut : deux colonnes séparées de 80 cm passaient le
  seuil de face et le rataient de trois quarts, d'où des traits qui
  apparaissaient et disparaissaient pendant un mouvement de caméra, tandis
  qu'une simple surface inclinée (l'estrade vue d'en bas) se couvrait de
  hachures parasites. Le rapport courbure / pente vaut ~1 sur *toute*
  discontinuité et ~0 sur une surface lisse, même vue en incidence rasante.
- **Trois règles de couleur, dans cet ordre** : pixel saturé → c'est une LED, on
  garde sa teinte ; pixel sombre et désaturé → c'est de l'encre peinte dans la
  scène (skyline, traits de sol) ; sinon → papier. Corollaire utile : dessiner
  en gris moyen suffit à reculer un élément sans changer l'épaisseur du trait.
- **Ce qui disparaît** : brume, bloom, aberration chromatique, vignettage, sol
  réfléchissant, murs de verre, plafond, liserés néon du décor — et les ombres
  portées, que plus aucun matériau ne reçoit.
- **Ce qui reste du sol** : quelques traits horizontaux sous les équipements. Le
  brief interdit un sol délimité ; un plan, même blanc, se trahirait par sa
  silhouette et par la ligne d'horizon que le trait en tirerait.
- **Les hachures sont coupées par défaut** : la page doit rester blanche. Le
  réglage existe encore (Lumière › *Hatching*), mais à zéro — sur une surface
  vue en incidence rasante, elles n'apparaissaient que sous certains angles de
  caméra, ce qui faisait "respirer" l'estrade sans raison.
- **La ville plonge sous le plateau** : les plans de fond sont trois fois plus
  grands et bien plus loin, et leur bord bas passe sous le sol. Aucune base
  d'immeuble n'est visible, les tours traversent le cadre de bout en bout —
  c'est ce qui dit qu'on regarde la ville depuis un étage élevé. Des immeubles
  qui commencent en l'air se lisaient comme une frise posée sur l'horizon.
- **Le personnage est réduit à des volumes simples** : une capsule pour le
  buste, une sphère pour la tête, des capsules pour les membres. Ni visage, ni
  casquette, ni casque : haut de deux pouces à l'écran, chaque détail
  supplémentaire devenait un nœud de micro-arêtes que la passe encre ne pouvait
  résoudre qu'en pâté noir. Le rig hiérarchique et les chorégraphies, eux, sont
  intacts.
- **Le HUD suit la même DA** : papier, contours fins, aucune lueur, analyseur en
  niveaux de gris. Une classe `ink` sur `<body>` suffit, la feuille de style est
  écrite autour de variables.

Le mode se coupe depuis *Lumière › Ink art direction* (la scénographie néon
d'origine est intacte), avec réglages du trait, du tremblement, des contours,
des hachures et de l'intensité du lavis coloré.

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
    Effects.tsx                chaîne de post-processing (néon ou encre)
    InkEffect.tsx              passe encre : trait, hachures, lavis coloré
    InkSurfaces.tsx            aplatissement des matériaux en blanc
    ink.ts                     constantes de la DA encre
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
