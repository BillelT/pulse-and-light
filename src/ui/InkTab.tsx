import { Section } from './controls'

/**
 * Onglet du mur (visualiseur).
 *
 * Le shader est reparti d'une base minimale : plus aucun reglage a exposer
 * tant qu'on n'a pas ajoute de brique. On garde l'onglet en place pour
 * accueillir les futurs sliders sans avoir a re-cabler la navigation du
 * panneau. La regle reste : un slider ici = un uniforme ou une constante du
 * modele, dans l'ordre ou la frame est calculee.
 */
export function InkTab() {
  return (
    <div>
      <Section title="Blank canvas">
        <div className="field-hint" style={{ marginTop: 4 }}>
          The wall shader is being rebuilt from scratch, one brick at a time.
          Controls will appear here as pieces of the model are added back.
        </div>
      </Section>
    </div>
  )
}
