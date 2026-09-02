import { AudioEngine } from './AudioEngine'

/**
 * Instance unique du moteur d'analyse.
 *
 * Volontairement hors de React : la scene la lit a 60 fps dans `useFrame`, et
 * faire transiter ces donnees par un state/context provoquerait un re-render
 * par frame sur tout l'arbre.
 */
export const engine = new AudioEngine()
