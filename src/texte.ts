// ── Texte für Panel und Bericht: Gründe, Arten, Status, Zahlformat ──

import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import type { Entfallen } from './rechner/zufahrten'
import type { Hindernis } from './rechner/hindernisse'
import { NEBENAST_GRAD } from './rechner/netz'
import type { Erkennung } from './rechner/erkennung'

export const f1 = (x: number) => x.toFixed(1).replace('.', ',')
export const f2 = (x: number) => x.toFixed(2).replace('.', ',')
/** Länge in m: ganze Zahlen ohne Dezimalen (Tab. 1), sonst eine Dezimale mit Komma (Sichtweite ohne Vortritt, auf 0,1 m) */
export const mText = (x: number) => (Number.isInteger(x) ? String(x) : f1(x))

// Gründe hier nicht geprüfter Richtungen (Nutzertest 23.10.2026: Alltagssprache, je Grund warum die Richtung hier nicht zählt und wo
// sie geprüft wird; wo sie geprüft werden müsste, aber nicht kann: «nicht geprüft: … – bitte vor Ort prüfen»). Platzhalter {anderer}:
// der andere Teil des Streifens bzw. die gerade Zufahrt (entfallenGrund setzt sie ein)
export const GRUND: Record<string, string> = {
  einbahn_osm: 'Einbahnstrasse: aus dieser Richtung fährt niemand (laut OSM)',
  richtungsfahrbahn: 'fährt auf der getrennten Gegenfahrbahn und kreuzt diesen Streifen nicht – geprüft beim Streifen dort',
  insel: 'fährt auf der anderen Seite der Insel vorbei und kreuzt diesen Teil des Streifens nicht – geprüft {anderer}',
  teilstreifen: 'fährt auf dem anderen Teil der Fahrbahn und kreuzt diesen Teil des Streifens nicht – geprüft {anderer}',
  insel_einbahn: 'Einbahn laut OSM, die auf der anderen Seite der Insel fährt: kreuzt diesen Teil des Streifens nicht',
  einspurig: 'neben der Verkehrsinsel fährt nur eine Richtung: aus dieser Richtung kommt hier niemand',
  einmuendung: 'die Strasse endet an der Kreuzung: von hier fährt niemand geradeaus über den Streifen',
  gerade_verboten: 'Geradeausfahren ist hier verboten (laut OSM)',
  gedeckt: 'mitgeprüft mit der geraden Zufahrt{anderer}: sie deckt dieselbe Sichtstrecke ab',
  kein_zufluss: 'die Einbahn führt von der Kreuzung weg: von dort kommt niemand zum Streifen',
  verbot: 'Abbiegen ist hier verboten (laut OSM)',
  kreisel: 'im Kreisel über den Ring mitgeprüft',
  wenden: 'würde auf die Gegenfahrbahn wenden: zählt nicht als Zufahrt',
  nebenast: `zweigt nur leicht ab (weniger als ${NEBENAST_GRAD}°): zählt nicht als eigene Abbiegerichtung`,
  zu_steil: 'biegt fast ganz zurück (über 150°): zählt nicht als Zufahrt',
  arm_schmal: 'die Querstrasse ist schmaler als 3 m: zu schmal für Fahrzeuge',
  arm_ohne_fahrbahn: 'nicht geprüft: die Amtliche Vermessung zeigt hier keine Fahrbahn – bitte vor Ort prüfen',
  geometrie: 'nicht geprüft: die Fahrlinie liess sich nicht auf die Fahrbahn legen – bitte vor Ort prüfen',
  wegende: 'die Strasse endet kurz vor dem Streifen: von dort kommt niemand',
  einbahn_widerspruch: 'nicht geprüft: die Einbahn-Angaben in OSM widersprechen sich – bitte vor Ort prüfen',
  hand: 'von Hand ausgeschlossen',
  hofzufahrt: 'Hof- bzw. Garagenzufahrt, die weiter weg einmündet als die Sicht nach der bfu-Knotenregel: die Strecke prüft die gerade Zufahrt',
}
/** Überschrift der Liste und Erklärung im Tooltip */
export const ENTFALLEN_TITEL = 'Hier nicht geprüfte Richtungen'
export const ENTFALLEN_ERKLAERUNG = 'Richtungen, die diesen Streifen nicht kreuzen, anderswo mitgeprüft werden oder nicht geprüft werden ' +
  'konnten; je Richtung steht der Grund'

/** Rohtexte des Rechners, die nur den Grund wiederholen (nicht zusätzlich zeigen) */
const NUR_GRUND = [/^Inselteil/, /^von Hand gestrichen$/, /^Verkehrsinsel an einem Ende$/, /^OSM Weg \d+$/]

/**
 * Grund einer hier nicht geprüften Richtung in Alltagssprache mit dem Ort, wo sie geprüft wird (anderer Teil des Streifens: der
 * Streifen, dessen Zufahrt auf demselben OSM-Weg in derselben Richtung fährt; gedeckt: die gerade Zufahrt über denselben Knoten),
 * und der Zusatz des Rechners, wenn er mehr sagt als der Grund (nur im Tooltip; bei «gedeckt» die Masse kurz)
 */
export function entfallenGrund(e: Entfallen, s: Pick<StreifenErgebnis, 'fgsId' | 'zufahrten'>,
  alle: readonly Pick<StreifenErgebnis, 'fgsId' | 'zufahrten' | 'trottoirueberfahrt' | 'nurVorbelegung'>[],
  titel: (fgsId: string) => string, zName: (fgsId: string, zufahrt: string) => string): { text: string; kurz?: string; zusatz?: string } {
  let roh = GRUND[e.grund] ?? 'aus einem anderen Grund nicht geprüft'
  let anderer = ''
  if (e.grund === 'insel' || e.grund === 'teilstreifen') {
    // Zufahrten einer Trottoirüberfahrt liegen nur für die Vorbelegung vor (nurVorbelegung)
    const zuf = (x: (typeof alle)[number]) => [...x.zufahrten, ...(x.nurVorbelegung?.zufahrten ?? [])]
    const andere = alle.filter(x => x.fgsId !== s.fgsId && zuf(x).some(z => z.osmWeg === e.osmWeg && z.osmWeg !== null && z.osmWeg !== '' &&
      winkelAbstand(z.richtung, e.richtung) < 45))
    const uebrige = alle.filter(x => x.fgsId !== s.fgsId)
    // Nachtrag nach Prüfung: ist der andere Teil eine Trottoirüberfahrt, wird die Sicht dort nicht geprüft (kein «geprüft beim anderen Teil»)
    const tue = andere.length ? andere.every(x => x.trottoirueberfahrt) : uebrige.length > 0 && uebrige.every(x => x.trottoirueberfahrt)
    if (tue) roh = roh.replace(' – geprüft {anderer}', ' – der andere Teil{anderer} ist eine Trottoirüberfahrt, dort wird die Sicht nicht geprüft')
    anderer = tue ? (andere.length === 1 ? ` (${titel(andere[0].fgsId)})` : '')
      : andere.length === 1 ? `beim anderen Teil (${titel(andere[0].fgsId)})` : 'beim anderen Teil des Streifens'
  } else if (e.grund === 'gedeckt') {
    const g = s.zufahrten.find(z => z.art !== 'abbiegend' && e.osmKnoten !== '' && z.osmKnoten === e.osmKnoten)
    anderer = g ? ` «${zName(s.fgsId, g.zufahrt)}»` : ''
  }
  const text = roh.replace('{anderer}', anderer)
  const q = e.quelle.trim()
  if (!q || NUR_GRUND.some(r => r.test(q))) return { text }
  // gedeckt: «Knoten 11,7 m vor dem Streifen; Kurvensichtweite des Abbiegers 10 m; die gerade Zufahrt prüft diese Strecke über 25 m mit»
  const m = /Knoten ([\d.,]+) m vor dem Streifen; Kurvensichtweite des Abbiegers ([\d.,]+) m; die gerade Zufahrt prüft diese Strecke über ([\d.,]+) m/.exec(q)
  if (e.grund === 'gedeckt' && m) {
    const r = (x: string) => String(Math.round(Number(x.replace(',', '.'))))
    return { text, kurz: `Kreuzung ${r(m[1])} m vor dem Streifen; Abbiegende brauchen ${r(m[2])} m Sicht, die gerade Zufahrt prüft ${r(m[3])} m`, zusatz: q }
  }
  return { text, zusatz: q }
}

/** Winkelabstand zweier Richtungen [Grad, 0–180] */
const winkelAbstand = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

/** Art einer Zufahrt in Worten (Nutzertest 23.10.2026) */
export const ART: Record<string, string> = { beide: 'geradeaus', einbahn: 'geradeaus, Einbahn', insel: 'geradeaus (Teil vor der Insel)', abbiegend: 'biegt ein' }
/** Herkunft des Tempos kurz */
export const tempoHerkunft = (q: string): string => (q === 'Ersatz' ? 'Annahme' : q === 'Korrektur' ? 'von Hand' : q === 'Geoportal' ? 'Geoportal' : 'OSM')
/** Herleitung der nötigen Sichtweite in Worten (die Fundstelle steht im Tooltip), z. B. «nach Tempo» statt «VSS Tab. 1» */
export function sichtQuelleKurz(q: string): string {
  // Annahme der App unter dem Normwert (30.10.2026): Annahme und ungekürzter Normwert sichtbar, ohne L
  if (/^Annahme: /.test(q)) return q.replace(/ \(L [^)]*\)$/, '')
  if (/40 240/.test(q) && /Begegnungszone/.test(q)) return 'Begegnungszone, Anhaltesichtweite'
  if (/40 240/.test(q)) return 'Querung ohne Vortritt'
  if (/^bis Kreiselring/.test(q)) return 'bis zum Kreiselring'
  if (/^bis Knoten/.test(q)) return 'bis zur Kreuzung'
  if (/^bis Wegende/.test(q)) return 'bis zum Wegende'
  if (/^bis Gebäude/.test(q)) return 'bis zum Gebäude'
  if (/Kurvensichtweite|Tab\. 2|bfu|Kreiselring|Radius/.test(q)) return 'nach Kurvenradius'
  return 'nach Tempo'
}
export const STATUS: Record<string, string> = {
  frei: 'frei', verdeckt: 'verdeckt (Auto-Parkfeld)', verdeckt_gebaeude: 'verdeckt (Gebäude)', verdeckt_hindernis: 'verdeckt (Hecke, Mauer bzw. übriges Hindernis)',
  verdeckt_baum: 'verdeckt (Baum)', verdeckt_zweirad: 'verdeckt (Zweirad-Feld)', kein_fgs: 'kein FGS (von Hand)', ohne_zufahrt: 'keine Zufahrt',
}
/** Status eines Streifens als Text; Trottoirüberfahrt (Wahl am Streifen) statt «kein FGS (von Hand)» */
export const streifenStatus = (s: Pick<StreifenErgebnis, 'status' | 'trottoirueberfahrt'>): string =>
  s.trottoirueberfahrt ? 'Trottoirüberfahrt' : STATUS[s.status] ?? s.status

// Trottoirüberfahrt am Streifen (23.10.2026): keine Sicht auf die Wartefläche, massgebend ist die Knotensicht (tue/knotensicht.ts)
export const TUE_OPTION = 'Trottoirüberfahrt (über eine Einmündung)'
export const TUE_NUR_EINMUENDUNG = 'nur an Einmündungen'

// Erkennungsdistanz (Sichtrechner, 23.10.2026): Texte für Sicht-Reiter, Bericht und Vorbelegung
const ENDE_TEXT: Record<string, string> = { knoten: 'Fahrlinie endet am Knoten, weiter zurück nicht geprüft',
  wegende: 'Fahrlinie endet am Wegende, weiter zurück nicht geprüft', kreisel: 'Fahrlinie endet im Kreisel, weiter zurück nicht geprüft',
  gebaeude: 'weiter zurück nicht prüfbar' }
const HINDERNIS_TEXT: Record<string, string> = { gebaeude: 'Gebäude', auto: 'Auto-Parkfeld' }
/** Wert der Erkennungsdistanz: «64 m» bzw. «mindestens 30 m» (Fahrlinie endet vorher) */
export const erkennungWert = (e: Erkennung): string => `${e.bis === 'fahrlinie_endet' ? 'mindestens ' : ''}${e.wert} m`
/** «erkennbar ab 64 m» bzw. «erkennbar auf mindestens 30 m» (Untergrenze, weiter zurück nicht geprüft) */
export const erkennungSatz = (e: Erkennung): string => `erkennbar ${e.bis === 'fahrlinie_endet' ? 'auf' : 'ab'} ${erkennungWert(e)}`
/** Zusatz: Grund des Endes der Fahrlinie, «so weit geprüft» (frei bis zur Prüfgrenze) bzw. das verdeckende Hindernis */
export const erkennungZusatz = (e: Erkennung): string => (e.bis === 'fahrlinie_endet' ? ENDE_TEXT[e.ende ?? 'wegende']
  : e.bis === 'frei' ? 'so weit geprüft' : `weiter entfernt verdeckt${e.hindernis ? `: ${HINDERNIS_TEXT[e.hindernis.klasse] ?? e.hindernis.name}` : ''}`)
/** Zeile im Sicht-Reiter und Bericht: «Streifen erkennbar ab 64 m (weiter entfernt verdeckt: Gebäude)» */
export const erkennungText = (e: Erkennung): string => `Streifen ${erkennungSatz(e)} (${erkennungZusatz(e)})`
/** Tooltip zur Erkennungsdistanz */
export const ERKENNUNG_TITEL = 'Erkennungsdistanz aus dem Sichtrechner: Sicht von der Fahrlinie auf die Markierung im eigenen Fahrstreifen, ' +
  'geprüft bis 110 m. Hindernisse: Gebäude, Hecken, Mauern, Bäume und Auto-Parkfelder. Annahme: 2D ohne Gelände (Kuppen, Senken); ' +
  'nur die Markierung, die blaue Tafel (Signal 4.11) nicht.'

/** Status einer Zufahrt; bei «verdeckt_hindernis» mit den Arten der verdeckenden Hindernisse (Hecke, Mauer, übriges Hindernis) */
export function statusText(z: ZufahrtErgebnis, hindernisse: Hindernis[]): string {
  if (z.status !== 'verdeckt_hindernis') return STATUS[z.status] ?? z.status
  const name: Record<string, string> = { hecke: 'Hecke', mauer: 'Mauer', uebrige: 'übriges Hindernis' }
  const arten = [...new Set(z.konflikte.filter(k => k.klasse === 'hindernis')
    .map(k => name[hindernisse.find(h => h.id === k.id)?.art ?? ''] ?? 'Hindernis'))]
  return `verdeckt (${arten.join(', ')})`
}

