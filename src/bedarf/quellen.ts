// ── Bedarfsmodul Runde 4: Quellenverzeichnis (Hilfe, Bericht, Verweise in den Details) ──
//
// Je Werk des Werkverzeichnisses (katalog.WERKE) eine Beschreibung in Alltagssprache, zwei Sätze: was es ist, wer es herausgibt,
// wofür es gilt und wie verbindlich es ist. Die Verbindlichkeit folgt nur aus der Ebene (Recht, Norm, Standard bzw. Arbeitshilfe
// einer Verwaltung, Richtlinie bzw. Empfehlung einer Fachstelle oder eines Verbands, Projektentscheid), nicht aus eigener Auslegung.
// Eigene Formulierungen, kein Text aus den Werken. Der Typ (Record über WerkId) verlangt für jedes Werk einen Text.
// Anzeige: Hilfe (Tabelle Werk · Ausgabe · Ebene · Beschreibung · Regeln), Bericht (nur Werke, die im Fall vorkommen), Details je
// Eintrag (Werk als Verweis auf das Verzeichnis bzw. mit dem Satz als Tooltip).

import { KATALOG, REGEL_IDS, WERKE, type WerkId } from './katalog'
import type { BefundBlatt } from './befundblatt'
import type { RegelDef } from './typen'
import { WERK_KURZ } from './feldhilfen'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

/** Ebene eines Werks in Worten (Herkunft und Verbindlichkeit) */
export type WerkEbene = 'Recht' | 'Norm' | 'Standard Stadt Bern' | 'Arbeitshilfe Kanton Bern' | 'Richtlinie bzw. Empfehlung' | 'Projektentscheid'

export interface WerkInfo {
  ebene: WerkEbene
  /** erster Satz: was es ist, wer es herausgibt, wofür es gilt */
  was: string
  /** zweiter Satz: wie verbindlich (aus der Ebene) */
  gilt: string
}

const NORM = 'Normen sind anerkannte Fachregeln, kein Gesetz; Behörden und Planende stützen sich darauf und begründen Abweichungen.'
const BUND = 'Bundesrecht, verbindlich.'
const STADT = 'Für die eigenen Projekte der Stadt Bern verbindlich, für andere Strassen eine Orientierung.'
const KANTON = 'Arbeitshilfe der kantonalen Verwaltung, keine Rechtsnorm: für die eigenen Projekte des Kantons verbindlich, sonst eine ' +
  'Orientierung.'
const FACHSTELLE = 'Empfehlung einer Fachstelle, weder Gesetz noch Norm.'

/** Beschreibung je Werk (Record: jedes Werk aus WERKE braucht einen Eintrag) */
export const WERK_INFO: Readonly<Record<WerkId, WerkInfo>> = {
  '40241': { ebene: 'Norm', was: 'VSS 40 241 ist die Schweizer Norm für Fussgängerstreifen des Schweizerischen Verbands der Strassen- ' +
    'und Verkehrsfachleute (VSS): wann ein Streifen angeordnet wird und wie er aussieht.', gilt: NORM },
  '40240': { ebene: 'Norm', was: 'VSS 40 240 ist die Norm des VSS zu Querungsanlagen für den Fussverkehr: welche Art Querung zu welcher ' +
    'Strasse passt, auch ohne Fussgängerstreifen.', gilt: NORM },
  '40242': { ebene: 'Norm', was: 'VSS 40 242 ist die Norm des VSS für Trottoirüberfahrten, bei denen das Trottoir ohne Unterbruch über ' +
    'eine einmündende Strasse weiterführt.', gilt: NORM },
  '40837': { ebene: 'Norm', was: 'VSS 40 837 ist die Norm des VSS für die Zeiten an Lichtsignalanlagen, etwa wie lange Grün und Gelb ' +
    'für Fussgänger mindestens dauern.', gilt: NORM },
  '40213': { ebene: 'Norm', was: 'VSS 40 213 ist die Norm des VSS für bauliche Elemente, die den Verkehr verlangsamen, etwa ' +
    'Einengungen und Trottoirnasen.', gilt: NORM },
  '640075': { ebene: 'Norm', was: 'SN 640 075 ist die Schweizer Norm für einen Strassenraum ohne Hindernisse, damit ihn auch Menschen ' +
    'mit Rollstuhl, Rollator oder Sehbehinderung benützen können (Randsteine, Inseln, Signalzeiten).', gilt: NORM },
  '640850a': { ebene: 'Norm', was: 'SN 640 850a ist die Schweizer Norm für Markierungen auf der Fahrbahn: Form, Masse und Einsatz, auch ' +
    'der Balken eines Fussgängerstreifens.', gilt: NORM },
  '640852': { ebene: 'Norm', was: 'SN 640 852 ist die Schweizer Norm für Markierungen, die blinde und sehbehinderte Menschen mit dem ' +
    'Stock ertasten und mit dem Restsehvermögen erkennen.', gilt: NORM },
  '640070': { ebene: 'Norm', was: 'SN 640 070 ist die Grundnorm für den Fussverkehr: Grundsätze für Wege, Netze und Anlagen der ' +
    'Fussgängerinnen und Fussgänger.', gilt: NORM },
  VOT30: { ebene: 'Recht', was: 'Die Zonen-Verordnung des Bundes (SR 741.213.3) legt fest, wie Tempo-30-Zonen und Begegnungszonen ' +
    'eingerichtet und gestaltet werden.', gilt: BUND },
  SSV: { ebene: 'Recht', was: 'Die Signalisationsverordnung (SR 741.21) legt fest, wie Signale und Markierungen aussehen, was sie ' +
    'bedeuten und wo sie stehen.', gilt: BUND },
  VRV: { ebene: 'Recht', was: 'Die Verkehrsregelnverordnung (SR 741.11) enthält die Regeln für alle, die im Verkehr unterwegs sind, ' +
    'etwa zum Halten und Parkieren nahe bei Fussgängerstreifen.', gilt: BUND },
  MP: { ebene: 'Standard Stadt Bern', was: 'Der Masterplan Fussverkehr enthält die Standards der Stadt Bern für Anlagen des Fussverkehrs, ' +
    'darunter Querungen, Inseln und Lichtsignale.', gilt: STADT },
  MPV: { ebene: 'Standard Stadt Bern', was: 'Der Masterplan Veloinfrastruktur enthält die Standards der Stadt Bern für Anlagen des ' +
    'Veloverkehrs; hier zählt die Breite neben einer Insel, wenn ein Radstreifen durchführt.', gilt: STADT },
  HBLSA: { ebene: 'Standard Stadt Bern', was: 'Das Handbuch Lichtsignalanlagen ist die Vorgabe der Stadt Bern für Planung und Betrieb ' +
    'ihrer Lichtsignalanlagen, etwa zu Wartezeiten und Anlagen auf Inseln.', gilt: STADT },
  AHBE: { ebene: 'Arbeitshilfe Kanton Bern', was: 'Die Arbeitshilfe Fussgängerstreifen des Tiefbauamts des Kantons Bern beschreibt, wie ' +
    'der Kanton Fussgängerstreifen anordnet und gestaltet, etwa die Breite auf Kantonsstrassen.', gilt: KANTON },
  BFU: { ebene: 'Richtlinie bzw. Empfehlung', was: 'Die Fachdokumentation MS.013 der Beratungsstelle für Unfallverhütung (bfu) fasst ' +
    'zusammen, was einen Fussgängerstreifen sicher macht; daraus stammt die Grundprüfung (Big Five).', gilt: FACHSTELLE },
  BFU2016: { ebene: 'Richtlinie bzw. Empfehlung', was: 'Ältere Ausgabe derselben Fachdokumentation der bfu; fgsCheck kennt sie nur ' +
    'über eine Checkliste aus Liechtenstein, die sie zitiert.', gilt: FACHSTELLE },
  HA: { ebene: 'Richtlinie bzw. Empfehlung', was: 'Die Richtlinie Strassen – Wege – Plätze der Fachstelle Hindernisfreie Architektur zeigt, ' +
    'wie Strassenräume für Menschen mit Behinderung ohne Hindernisse gestaltet werden.', gilt: 'Richtlinie einer Fachstelle, weder Gesetz noch Norm.' },
  VCS: { ebene: 'Richtlinie bzw. Empfehlung', was: 'Die Broschüre des Verkehrs-Clubs der Schweiz (VCS) zum sicheren Queren in ' +
    'Tempo-30-Zonen zeigt Beispiele und Auslegungen.', gilt: 'Empfehlung eines Verbands, weder Gesetz noch Norm.' },
  ENTSCHEID: { ebene: 'Projektentscheid', was: 'Entscheide des Projekts fgsCheck, wo die Grundlagen keine Antwort geben oder die App eine ' +
    'Vereinfachung braucht, etwa nur Querungen innerorts zu beurteilen.', gilt: 'Kein externes Werk und nicht verbindlich; solche Regeln ' +
    'heissen Projektentscheid.' },
}

/** Werke in der Reihenfolge des Werkverzeichnisses */
export const WERK_IDS = Object.keys(WERKE) as WerkId[]

/** Kurzname eines Werks für Verweise (wie «Wozu»), z. B. «VSS 40 241», «Tempo-30-Zonen-Verordnung» */
export const werkKurz = (w: WerkId): string => WERK_KURZ[w] ?? WERKE[w].name
/** Anker eines Werks im Quellenverzeichnis der Hilfe */
export const werkAnker = (w: string): string => `quelle-${w}`

/** Regeln mit eigenem Befund (auch Grundprüfung; ohne Weichen, gestrichene, Verweise und Aggregate – gezählt wie Prüfübersicht und
 * Muss-Hinweis), die ein Werk als Quelle nennen */
export function regelnJeWerk(): Map<WerkId, number> {
  const m = new Map<WerkId, number>(WERK_IDS.map(w => [w, 0]))
  for (const id of REGEL_IDS) {
    const d = DEF[id]
    if (d.art !== 'befund') continue
    for (const w of new Set(d.quellen.map(q => q.werk as WerkId))) m.set(w, (m.get(w) ?? 0) + 1)
  }
  return m
}

/** Werke einer Regel (unbekannte Nummer: keine) */
export const werkeVon = (id: string): WerkId[] => [...new Set((DEF[id]?.quellen ?? []).map(q => q.werk as WerkId))]

/** Werke, die im Fall in Einträgen (Befundblatt) bzw. in der Grundprüfung vorkommen, in der Reihenfolge des Werkverzeichnisses */
export function werkeImFall(blaetter: readonly BefundBlatt[]): WerkId[] {
  const ids = new Set<string>()
  for (const b of blaetter) {
    for (const x of b.befund.alle) ids.add(x.id)
    if (b.grund.gilt) for (const t of [...b.grund.punkte.flatMap(p => [...p.teile, ...p.notizen]), ...b.grund.weitere]) ids.add(t.id)
  }
  const w = new Set([...ids].flatMap(werkeVon))
  return WERK_IDS.filter(x => w.has(x))
}

/** Beschreibung eines Werks in zwei Sätzen */
export const werkText = (w: WerkId): string => `${WERK_INFO[w].was} ${WERK_INFO[w].gilt}`
