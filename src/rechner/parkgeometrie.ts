// Gemeinsame Parkplatzannahmen von SichtweitenCheck und fgsCheck. Originaldaten bleiben unverändert.
// Seit 14.11.2026 (Plan AV-Geometrie, «Nachträge für den Baustein», aus A4) liegen die Regel «Zur Fahrbahn hin ergänzt; der
// gegenüberliegende Rand bleibt erhalten» (parkFeldPruefen), parkMasse, die Texte der Grundlagen und die Regelbreite der Auto-
// Längsparkierung im Kartenbaustein (kartenbaustein/parkregel.ts), damit VeloroutenCheck und fgsCheck dieselbe Funktion nutzen. Hier
// bleiben die Zuordnung zum Gebiet (AV-Fläche), Zweirad- und Motorradflächen und der Bezug zur nächsten OSM-Strassenachse.
import { type P, sub, dot, dist, einheit, imPolygon, abstandStrecke } from '../geo'
import type { AvFlaeche } from '../daten/av'
import type { Hindernis } from './hindernisse'
import type { OsmNetz } from './netz'
import { PARK_BE_VELO, parkFeldPruefen, parkMasse, parkRegel as parkRegelGebiet, type ParkPruefung, type ParkRegel } from '../kartenbaustein/parkregel'

export { PARK_SN, PARK_ZH, PARK_BE_AUTO, PARK_BE_VELO, PARK_GRUNDLAGE, parkMasse } from '../kartenbaustein/parkregel'
export type { ParkPruefung, ParkRegel } from '../kartenbaustein/parkregel'

export type ParkAnordnung = 'laengs' | 'senkrecht' | 'schraeg45'
export const MOTO_TIEFE: Record<ParkAnordnung, number> = { laengs: 1.2, senkrecht: 2.3, schraeg45: 1.9 }
export const PARK_ANORDNUNG_TEXT: Record<ParkAnordnung, string> = { laengs: 'längs', senkrecht: 'senkrecht', schraeg45: 'schräg 45°' }
export const parkAnordnungLesen = (x: unknown): ParkAnordnung | undefined =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(MOTO_TIEFE, x) ? x as ParkAnordnung : undefined
/** Kanton am Objekt, auch wenn das Parkfeld gerade ausserhalb der AV-Strassenfläche liegt. */
export function parkRegel(av: readonly AvFlaeche[], p?: P): ParkRegel & { breite: number }
export function parkRegel(av: readonly AvFlaeche[], p: P | undefined, klasse: string, anordnung?: ParkAnordnung): ParkRegel
export function parkRegel(av: readonly AvFlaeche[], p?: P, klasse = 'auto', anordnung?: ParkAnordnung): ParkRegel {
  let f = av.find(f => f.art === 'Strasse_Weg') ?? av[0]
  if (p && av.length) {
    f = av.find(f => imPolygon(p, f.ringe)) ?? av.reduce((a, b) => {
      const ab = (f: AvFlaeche) => Math.min(...f.ringe.flatMap(r => r.map((q, i) => abstandStrecke(p, q, r[(i + 1) % r.length]))))
      return ab(a) <= ab(b) ? a : b
    })
  }
  const bern = f?.bfs === 351
  if (klasse === 'motorrad') return { breite: anordnung ? MOTO_TIEFE[anordnung] : null,
    gebiet: bern ? 'Stadt Bern' : 'aus Bern übertragene Modellannahme', grundlage: `${PARK_BE_VELO}, Motorradflächen: ` +
      `längs 1,20 m, senkrecht 2,30 m, schräg 45° 1,90 m; ${anordnung ? `Anordnung von Hand: ${PARK_ANORDNUNG_TEXT[anordnung]}` : 'Anordnung noch offen'}${bern ? '' : '; ausserhalb Berns als Modellannahme'}`,
    quellenId: 'norm.park.be.zweirad' }
  if (klasse === 'velo') return { breite: 1.9, gebiet: bern ? 'Stadt Bern' : 'aus Bern übertragene Modellannahme',
    grundlage: `${PARK_BE_VELO}, Parkfeld Velo: 1,90 m Tiefe quer zur Strasse${bern ? '' : '; ausserhalb Berns als Modellannahme'}`,
    quellenId: 'norm.park.be.zweirad' }
  return parkRegelGebiet({ bern, kanton: f?.kanton })
}

const EPS = 1e-7

/** Nächste befahrbare Strassenachse bis 15 m; bei konkurrierenden Achsen keine Seitenzuordnung raten. */
function strasse(netz: OsmNetz | null, p: P): { p: P; t: P } | null {
  const kandidaten: { p: P; t: P; d: number }[] = []
  for (const w of netz?.W.values() ?? []) {
    if (!w.mfz) continue
    for (let i = 0; i + 1 < w.nds.length; i++) {
      const a = netz!.p(w.nds[i]), b = netz!.p(w.nds[i + 1]), v = sub(b, a), l2 = dot(v, v)
      if (l2 < EPS) continue
      const f = Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)), q: P = [a[0] + f * v[0], a[1] + f * v[1]]
      const d = dist(p, q)
      if (d <= 15) kandidaten.push({ p: q, t: einheit(v), d })
    }
  }
  kandidaten.sort((a, b) => a.d - b.d)
  const a = kandidaten[0]
  if (!a || kandidaten.some(b => b.d <= a.d + 0.5 && (Math.abs(dot(a.t, b.t)) < Math.cos(Math.PI / 9) ||
    dot(sub(a.p, p), sub(b.p, p)) < 0))) return null
  return a
}

export function parkPruefflaechen(liste: readonly Hindernis[], av: readonly AvFlaeche[], netz: OsmNetz | null): Hindernis[] {
  return liste.map(h => {
    if (h.art !== 'parkfeld' || h.quelle !== 'kataster' || h.parkPruefung) return h
    const velo = h.klasse === 'velo' && (h.katasterTyp === 'Parkplatz_Velo_Mofa' || h.id.includes(':Parkplatz_Velo_Mofa:'))
    const moto = h.klasse === 'motorrad' && (h.katasterTyp === 'Parkplatz_Motorrad' || h.id.includes(':Parkplatz_Motorrad:'))
    const zweirad = velo || moto
    if (h.klasse !== 'auto' && !zweirad) return h
    const mitte: P = h.ring.length ? [h.ring.reduce((s, p) => s + p[0] / h.ring.length, 0), h.ring.reduce((s, p) => s + p[1] / h.ring.length, 0)] : [0, 0]
    let s = zweirad ? strasse(netz, mitte) : null
    // Bei einer kurzen Velo-Gruppe kann die Tiefe grösser als die Reihenlänge sein: quer zur Strasse messen,
    // nicht pauschal die kürzeste Polygonseite verbreitern. Richtung aus einer strassenparallelen Katasterkante.
    const parallel = zweirad && s ? h.ring.map((p, i) => einheit(sub(h.ring[(i + 1) % h.ring.length], p)))
      .filter(u => Math.abs(dot(u, s!.t)) >= Math.cos(Math.PI / 9)).sort((a, b) => Math.abs(dot(b, s!.t)) - Math.abs(dot(a, s!.t)))[0] : undefined
    const regel = parkRegel(av, mitte, h.klasse, h.parkAnordnung)
    if (regel.breite === null) {
      const m = zweirad && !parallel ? null : parkMasse(h.ring, parallel)
      const pruefung: ParkPruefung = { original: h.ring.map(p => [...p] as P), katasterBreite: m?.breite ?? null, pruefBreite: m?.breite ?? null,
        ergaenzung: 0, regel, status: 'unklar', hinweis: 'Motorrad-Anordnung im Kataster nicht angegeben: längs, senkrecht oder schräg 45° am Luftbild prüfen und festlegen. Bis dahin Originalumriss unverändert.' }
      return { ...h, parkPruefung: pruefung }
    }
    // Regel des Kartenbausteins; die Strassenachse wird für Autoparkfelder erst gesucht, wenn das Feld ergänzt werden müsste
    const x = parkFeldPruefen(h.ring, regel as ParkRegel & { breite: number }, () => (s ??= strasse(netz, mitte)), { richtung: parallel, zweirad })
    return x.pruefung.status === 'ergaenzt' ? { ...h, ring: x.ring, parkPruefung: x.pruefung } : { ...h, parkPruefung: x.pruefung }
  })
}

const f2 = (x: number | null) => x === null ? 'nicht bestimmbar' : `${x.toFixed(2).replace('.', ',')} m`
export function parkPruefText(h: Hindernis): string {
  const p = h.art === 'parkfeld' ? h.parkPruefung : undefined
  if (!p) return ''
  const zweirad = h.art === 'parkfeld' && h.klasse !== 'auto'
  return `Katasterbreite ${zweirad ? 'quer zur Strasse' : 'quer zur Längsrichtung'} ${f2(p.katasterBreite)}; verwendete Prüffläche ${f2(p.pruefBreite)}. ` +
    (p.status === 'ergaenzt' ? `Um ${f2(p.ergaenzung)} zur Fahrbahn hin ergänzt. ` : p.status === 'unklar' ? `${p.hinweis} ` : 'Originalumriss unverändert. ') +
    `Mindest${zweirad ? 'tiefe der Zweiradfläche' : 'breite für Längsparkierung'} ${f2(p.regel.breite)} (${p.regel.gebiet}); ${p.regel.grundlage}. ` +
    `${zweirad ? 'Zweiradfläche: nur Hinweis, keine Sichtverdeckung.' : 'Belegung angenommen.'} Diese Fläche gilt für Sichtprüfung und Darstellung; erkannte Parkstreifen beeinflussen auch die Fahrlinie.`
}

/** Ersetzt nur Parkfelder; ermöglicht auch mehrere verbleibende Teilflächen unter derselben Quell-Id (Plan-Seitenraum). */
export function parkDarstellung(liste: readonly Hindernis[], gerechnet?: readonly Hindernis[]): Hindernis[] {
  if (!gerechnet) return [...liste]
  return liste.flatMap(h => h.art === 'parkfeld' || h.art === 'laengsparkierung' ? gerechnet.filter(p => p.id === h.id) : [h])
}

/** Neue Anordnung immer am Quellenumriss anwenden, damit eine frühere Ergänzung nicht zur neuen Quelle wird. */
export function parkMitAnordnung(h: Hindernis, anordnung: ParkAnordnung | undefined): Hindernis {
  if (h.art !== 'parkfeld') return h
  const { parkPruefung, ...roh } = h
  return { ...roh, ring: (parkPruefung?.original ?? h.ring).map(p => [...p] as P), parkAnordnung: anordnung }
}


/** Gemeinsame, kurze Annahme für Ergebnis und Bericht; Einzelangaben folgen nur bei einem Ergebnisbeitrag. */
export const PARK_BERICHT_ANNAHME = 'Parkfelder gelten als besetzt, einschliesslich Parkverbotsflächen. Velo-/Mofa- und Motorradflächen ergeben nur Hinweise zur Sicht. ' +
  'Mindestbreite für Auto-Längsparkierung: Bern und ohne örtliche Vorgabe 1,90 m, Kanton Zürich 2,00 m (Modellannahme). ' +
  'Velo/Mofa: 1,90 m Tiefe; Motorrad je bestätigter Anordnung 1,20 / 2,30 / 1,90 m. ' +
  'Ergänzung nur bei eindeutiger Zuordnung zur Fahrbahn hin; sonst Originalumriss. Belegung und Geometrie sind Annahmen. ' +
  'Die verwendete Prüffläche gilt für Sichtprüfung, Parkstreifenerkennung und Darstellung; grau gestrichelt der ursprüngliche Katasterumriss einer ergänzten Fläche.'
