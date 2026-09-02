# Document de Conception et Brief Projet : Scénographie Audio-Réactive WebGL

Ce document compile les fondements scientifiques et techniques de la traduction audio-visuelle (Sound-to-Light) et définit le brief pour le développement d'une scène WebGL interactive connectée à l'API Spotify.

---

## PARTIE 1 : FONDEMENTS SCIENTIFIQUES & MATHÉMATIQUES (SOUND-TO-LIGHT)

La transposition de la musique en lumière repose sur l'analyse spectrale du signal audio (via la Transformée de Fourier Rapide ou FFT) et la correspondance psycho-acoustique.

### 1. Correspondance Fréquentielle (Le Spectre)
En physique, le son (ondes mécaniques) et la lumière (ondes électromagnétiques) fonctionnent sur des spectres différents, mais on peut mathématiquement les faire correspondre en associant les basses fréquences sonores aux basses fréquences lumineuses (infrarouge/rouge), et les hautes fréquences sonores aux hautes fréquences lumineuses (bleu/ultraviolet).

| Bande Audio | Fréquence (Hz) | Cible Scénographique | Couleur Type (Longueur d'onde) | Comportement Lumineux |
| :--- | :--- | :--- | :--- | :--- |
| **Sub-Basses** | 20 - 60 Hz | Caissons, Sol, Totems bas | **Rouge profond** (~700 nm) | Pulsations lourdes, lent decay, ancrage au sol. |
| **Basses** | 60 - 250 Hz | Stacks inférieurs, Wash | **Orange / Magenta** (~600 nm)| Mouvements de tilt rythmiques, intensité forte sur les *kicks*. |
| **Low Mids** | 250 - 500 Hz | Éclairage d'ambiance | **Ambre / Jaune** (~580 nm) | Nappes de fond, changements de couleurs fluides. |
| **High Mids** | 2 kHz - 4 kHz| Faisceaux (Beams), Lasers | **Vert / Cyan** (~520 nm) | Suivi de la mélodie principale, mouvements spatiaux (Pan/Tilt). |
| **Aigus (Brillance)** | 4 kHz - 20 kHz| Stroboscopes, Lignes LED | **Bleu / Blanc froid** (~450 nm)| Flashs instantanés (attaques courtes sur charley/cymbales). |

### 2. Formules et Data Mapping (À implémenter)

*   **Intensité (Luminosité / Bloom) :** L'oreille humaine perçoit le volume de manière logarithmique. L'intensité lumineuse ($I$) doit suivre cette courbe pour paraître naturelle.
    *   *Formule :* $I = \log_{10}(1 + \text{Amplitude}_{FFT} \times K)$ où $K$ est un facteur de gain.
*   **Système Synesthésique (Scriabine / Cercle des Quintes) :** Si l'API Spotify (Audio Analysis) fournit la tonalité (*Pitch/Key*), l'algorithme peut teinter la scène globale.
    *   *C (Do)* = Rouge, *D (Ré)* = Jaune, *E (Mi)* = Bleu ciel, etc.
*   **Détection de transitoires (BPM / Onset) :** La dérivée de l'énergie dans la bande des basses permet de détecter les kicks.
    *   *Action :* Déclenchement d'un flash blanc ou d'un changement de caméra brutal (Camera Shake) si $\Delta E > \text{Seuil}$.

---

## PARTIE 2 : BRIEF PROJET WEBGL

### 1. Concept & Vision Artistique
Créer un environnement 3D temps réel (WebGL) en esthétique **Mid-Poly** (formes géométriques lisibles, arêtes douces, atmosphère stylisée sans être ultra-réaliste). La scène représente un "autel" sonore composé de caissons de basses et de "stacks" (totems) lumineux, réagissant organiquement à la musique lue depuis Spotify.

### 2. Stack Technique Recommandée
*   **Moteur 3D :** Three.js (avec `@react-three/fiber` et `@react-three/drei` si environnement React).
*   **Post-Processing :** `EffectComposer` pour le **Bloom** (essentiel pour l'effet néon/lumière) et le *Chromatic Aberration* sur les basses.
*   **Data Audio :** 
    *   *Option A (Temps Réel) :* Web Audio API (AnalyserNode) connecté à une source audio locale ou au flux Spotify (via un loopback ou la piste preview).
    *   *Option B (Pré-calculé via Spotify) :* Endpoint **Spotify Audio Analysis API** qui fournit un fichier JSON massif avec les *segments*, *tatums*, *beats*, *bars*, et le *timbre/pitch* au dixième de seconde près.
*   **Shaders :** GLSL personnalisé pour les matériaux des enceintes (qui se déforment) et les halos lumineux.

### 3. Composition de la Scène (Mid-Poly)
1.  **L'Élément Central (Les Basses) :** 
    *   Un mur ou un cluster central de caissons de basses massifs (esthétique industrielle épurée).
    *   *Réaction :* Les membranes des haut-parleurs s'avancent physiquement (Scale Z ou vertex shader) en fonction des fréquences < 100 Hz.
2.  **Les Stacks Lumineux (Les Totems) :**
    *   Des colonnes verticales encadrant les caissons, intégrant des barres LED (Cylindres ou plans avec un `MeshBasicMaterial` et une intensité > 1.0 pour déclencher le Bloom).
    *   *Réaction :* S'illuminent de bas en haut selon l'amplitude globale (comme un VU-mètre) ou réagissent aux hauts-médiums (Cyan/Blanc).
3.  **L'Environnement :**
    *   Un sol réfléchissant (Roughness faible, Metalness élevé) pour faire rebondir la lumière.
    *   Une brume volumétrique discrète (`FogExp2` dans Three.js) pour matérialiser les faisceaux.

---

## PARTIE 3 : INTERPRÉTATION ET AJUSTEMENTS (YOUR PLAYGROUND)

Puisque la science ne fait pas tout dans l'art de la scénographie, cette section liste les "trous" volontaires dans les données scientifiques, qui serviront de variables d'ajustement dans le code. C'est ici que tu interviens en tant que "Lighting Designer" pour ajuster le feeling :

1.  **Le Mapping des Couleurs (Color Palette Tweaking) :**
    *   *Le "Trou" :* La traduction exacte d'une fréquence sonore en longueur d'onde lumineuse donne un résultat souvent trop chaotique et arc-en-ciel. 
    *   *Ton Ajustement :* Forcer une palette restreinte (ex: Cyberpunk = Cyan/Magenta/Jaune) et lier les notes (Pitch) uniquement aux nuances de cette palette, plutôt qu'à tout le spectre visible.
2.  **L'Amortissement (Damping / Lerping) :**
    *   *Le "Trou" :* La data FFT brute oscille à 60 images/seconde. Si la lumière suit exactement la data, l'effet sera stroboscopique et épuisant pour les yeux.
    *   *Ton Ajustement :* Implémenter une fonction mathématique de lissage (LERP - Linear Interpolation) ou un système physique de ressort (Spring physics) pour que la lumière s'allume vite (attaque) mais s'éteigne avec une légère inertie (decay).
3.  **Les Seuils de Déclenchement (Thresholds) :**
    *   *Le "Trou" :* Les musiques ont des mixages différents (mastering très fort ou dynamique jazz).
    *   *Ton Ajustement :* Créer un slider dans le panneau de contrôle (UI) pour définir un plancher (Noise Floor) et un plafond (Clipping) d'amplitude, afin que la scène ne soit pas soit tout le temps noire, soit tout le temps saturée de lumière.
4.  **La Traduction du Timbre :**
    *   Si l'API de Spotify renvoie une donnée de "Timbre" (brillance, attaque, rugosité), tu pourras l'utiliser pour modifier non pas la couleur, mais la *texture* de la lumière (ex: augmenter le grain ou faire clignoter aléatoirement une lumière si le son est saturé/distordu).
