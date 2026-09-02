# Audit visuel — Pulse & Light

Périmètre : composition de la scène 3D (`src/scene/`), matériaux, éclairage,
post-processing. Comparé à la référence `ref.jpg` et au brief
`Brief_Projet_WebGL_AudioReactive.md`.

Légende de sévérité :
- 🔴 **Bloquant** — casse la lisibilité ou l'identité visuelle voulue.
- 🟠 **Important** — écart notable avec la référence / potentiel non exploité.
- 🟡 **Mineur** — finition, détail, confort visuel.

Aucun point 🔴 identifié : la base (mur VU-mètre, palette contrainte,
mixage HSL par plus court chemin, bloom sélectif) est solide et fidèle au
brief. Les points ci-dessous sont des axes d'amélioration, pas des bugs.

---

## 🟠 1. Disposition figée et frontale

**Constat.** Le mur est un unique arc symétrique, la caméra reste bridée en
`theta ∈ [-0.85, 0.85]` (`Rig.tsx:12-16,51`) : le point de vue reste
quasiment toujours face au mur. Sur une écoute longue, la composition ne se
renouvelle jamais.

**Pistes.**
- Un second plan (mur secondaire en fond, plus petit et moins lumineux, ou
  trusses latérales avec faisceaux mobiles) casserait la symétrie plate.
- Un mode caméra "cut" occasionnel sur les gros onsets (changement de plan
  bref plutôt qu'un simple shake) donnerait un rythme de mise en scène,
  comme un vrai VJing.

## 🟠 2. Caissons de basses sous-exploités visuellement

**Constat.** `SubCabinets.tsx` implémente un vrai mouvement physique de
membrane sur le sub (`push = bands[Sub]*0.75 + bands[Bass]*0.25`,
`SubCabinets.tsx:42-53`) — c'est un excellent détail, mais les caissons sont
petits et repoussés loin sur les côtés (`x: ±10.6`), donc peu visibles dans
le cadrage par défaut (`Rig.tsx` : `radius` ~11–46, position de repos ~22).

**Pistes.** Les rapprocher légèrement du centre / de la caméra, ou les
agrandir, ou prévoir un point de vue caméra dédié qui les cadre sur les
gros drops (le mouvement de membrane mérite d'être vu).

## 🟠 3. Danseur/régie peu lisible dans le cadrage par défaut

**Constat.** `Dancer.tsx` est un rig hiérarchique soigné (bassin → buste →
tête, épaule → coude, hanche → genou, calé sur la grille rythmique BPM) mais
reste minuscule à l'échelle de la scène et dans la pénombre ambiante — sur
la plupart des plans il est presque un détail perdu.

**Pistes.** Un spot dédié (même faible) sur le podium DJ, ou un point de vue
caméra qui zoome dessus sur certains passages, valoriserait ce travail
d'animation qui est actuellement sous-exploité.

## 🟠 4. Spill lights statiques : pas de vrais "moving heads"

**Constat.** Les 5 `pointLight` de retombée (`CaissonWall.tsx:311-331`,
`SPILL_LIGHTS`) suivent bien la couleur/intensité moyenne de leur tranche de
colonnes, mais leur **position est fixe** — elles éclairent toujours la même
zone du sol, seule l'intensité/couleur varie.

**Piste.** Remplacer 1 ou 2 d'entre elles par des `SpotLight` dont la
`target` balaie lentement (ou saute sur le beat), pour un vrai effet de
faisceaux mobiles façon régie de club plutôt qu'un simple wash statique.

## 🟠 5. Sol réfléchissant très flou : perd le côté "sol laqué de club"

**Constat.** `MeshReflectorMaterial` (`Stage.tsx:58-71`) utilise
`blur: [300, 90]` et `mixStrength: 18` — volontairement doux pour éviter les
pastilles spéculaires (commentaire explicite dans le code), mais au prix
d'une réflexion qui ressemble à une nappe de couleur diffuse plutôt qu'à un
vrai sol mouillé/laqué qui refléterait des traits nets des colonnes.

**Piste.** Réduire légèrement le blur et augmenter `mirror` (actuellement
`0.24`) en gardant `roughnessMap` pour casser les hotspots sans revenir au
problème initial — un compromis intermédiaire est probablement atteignable.

## 🟡 6. Cellules LED géométriquement plates, sans relief

**Constat.** `LED_GEOMETRY = new BoxGeometry(1,1,1)` (`CaissonWall.tsx:52`)
donne des faces parfaitement planes. Combiné au bloom, l'effet néon
fonctionne bien, mais sans aucun bevel/chanfrein le rendu reste proche d'un
aplat CSS plutôt que d'un vrai boîtier LED avec un léger reflet spéculaire
sur les bords.

**Piste.** Un chanfrein léger (`BoxGeometry` remplacée par une géométrie
avec arêtes adoucies, ou un `RoundedBoxGeometry`) capterait un filet de
lumière ambiante sur les bords, renforçant l'objet physique.

## 🟡 7. Matériaux de châssis génériques, sans usure

**Constat.** `bodyMaterial`/`bezelMaterial` (`CaissonWall.tsx:108-115`) sont
des `MeshStandardMaterial` gris unis. `textures.ts` ne fournit que des
textures de grating/tuiles (roughness map), pas de normal map ni de trace
d'usure.

**Piste.** Une normal map discrète (grain de tôle, petites rayures) sur le
châssis donnerait de la matière sans coût de lisibilité — actuellement le
châssis a un côté "rendu propre" qui contraste avec l'ambiance industrielle
recherchée par le brief.

## 🟡 8. Flash de strobe limité aux dernières cellules allumées

**Constat.** Le flash sur transitoire (`CaissonWall.tsx:294-299`) ne
s'applique qu'aux 3 cellules sous le sommet de chaque colonne allumée — un
effet de liseré plutôt qu'un vrai strobe.

**Piste.** Sur un `frame.onset` fort (pas juste `beat` qui redescend
progressivement), déclencher un flash bref généralisé sur toute la face,
distinct du liseré de crête actuel — donnerait plus d'impact sur les gros
drops.

## 🟡 9. Seuil de bloom fixe, insensible au niveau ambiant

**Constat.** `luminanceThreshold={0.62}` (`Effects.tsx:69`) est une
constante. Sur les passages très calmes, peu de cellules dépassent ce seuil
et le halo devient sec/absent, alors qu'un léger halo ambiant permanent
garderait une continuité visuelle.

**Piste.** Moduler légèrement le seuil (ou l'intensité minimale du bloom)
en fonction de `frame.level`, pour ne jamais retomber à un bloom totalement
plat même en passage calme.

## 🟡 10. Palette : bonne base, mixage rampe/fréquence à surveiller sur teintes extrêmes

**Constat.** `mixHueShortest` (`palettes.ts:123-135`) résout bien le
problème du lerp HSL naïf (magenta→vert qui traversait le bleu). C'est un
détail bien pensé. Reste que sur la palette `cyberpunk`, la rampe et les
bandes partagent des teintes très proches (cyan/magenta des deux côtés) —
le rendu final peut légèrement écraser la distinction "hauteur dans la
colonne" vs "fréquence mesurée" que le VU-mètre est censé porter. À valider
visuellement palette par palette plutôt qu'un vrai bug.

---

## Synthèse — ordre de traitement suggéré

| # | Sujet | Sévérité | Effort estimé |
|---|-------|----------|----------------|
| 1 | Disposition figée / caméra toujours frontale | 🟠 | Élevé |
| 2 | Caissons de basses peu visibles | 🟠 | Faible |
| 3 | Danseur peu lisible dans le cadrage par défaut | 🟠 | Faible/Moyen |
| 4 | Spill lights statiques, pas de moving heads | 🟠 | Moyen |
| 5 | Sol réfléchissant trop flou | 🟠 | Faible |
| 6 | Cellules LED sans relief | 🟡 | Faible |
| 7 | Châssis sans usure/normal map | 🟡 | Moyen |
| 8 | Strobe limité aux cellules de crête | 🟡 | Faible |
| 9 | Seuil de bloom fixe | 🟡 | Faible |
| 10 | Proximité de teintes rampe/bandes sur certaines palettes | 🟡 | Faible (à valider visuellement) |

Rien ici n'est bloquant pour l'usage actuel — ce sont des axes
d'enrichissement, à traiter après le volet technique (fidélité audio) qui
conditionne le contenu que ces améliorations visuelles viendront sublimer.
