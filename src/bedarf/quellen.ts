// ── Bedarfsmodul Runde 4: Quellenverzeichnis (Hilfe, Bericht, Verweise in den Details) ──
//
// Je Werk des Werkverzeichnisses (katalog.WERKE) eine Beschreibung in Alltagssprache: was es ist, wer es herausgibt, wofür es gilt,
// und (ausser bei Normen, Nutzerentscheid 23.10.2026) wie verbindlich es ist. Die Verbindlichkeit folgt nur aus der Ebene (Recht, Norm, Standard bzw. Arbeitshilfe
// einer Verwaltung, Richtlinie bzw. Empfehlung einer Fachstelle oder eines Verbands, Projektentscheid), nicht aus eigener Auslegung.
// Eigene Formulierungen, kein Text aus den Werken. Der Typ (Record über WerkId) verlangt für jedes Werk einen Text.
// Anzeige: Hilfe (Tabelle Werk · Ausgabe · Ebene · Beschreibung · Regeln), Bericht (nur Werke, die im Fall vorkommen), Details je
// Eintrag (Werk als Verweis auf das Verzeichnis bzw. mit dem Satz als Tooltip). Verzeichnisse und Tooltips nennen den vollen Titel
// (WERKE.voll) und die offizielle Adresse beim Herausgeber (Panel: Link ↗ in neuem Fenster; Bericht: Adresse als Text).

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
  /** zweiter Satz: wie verbindlich (aus der Ebene); bei Normen leer */
  gilt: string
}

/** Normen: kein zweiter Satz (Nutzerentscheid 23.10.2026: der Satz zur Verbindlichkeit von Normen ist gestrichen) */
const NORM = ''
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
  '40273': { ebene: 'Norm', was: 'VSS 40 273 ist die Norm des VSS für die Sicht an Knoten; fgsCheck nutzt daraus die Sichtweiten ' +
    'für den Veloverkehr.', gilt: NORM },
  '40213': { ebene: 'Norm', was: 'VSS 40 213 ist die Norm des VSS für bauliche Elemente, die den Verkehr verlangsamen, etwa ' +
    'Einengungen und Trottoirnasen.', gilt: NORM },
  '640075': { ebene: 'Norm', was: 'SN 640 075 ist die Schweizer Norm für einen Strassenraum ohne Hindernisse, damit ihn auch Menschen ' +
    'mit Rollstuhl, Rollator oder Sehbehinderung benützen können (Randsteine, Inseln, Signalzeiten).', gilt: NORM },
  '640850a': { ebene: 'Norm', was: 'SN 640 850a ist die Schweizer Norm für Markierungen auf der Fahrbahn: Form, Masse und Einsatz, auch ' +
    'der Balken eines Fussgängerstreifens.', gilt: NORM },
  '640852': { ebene: 'Norm', was: 'SN 640 852 ist die Schweizer Norm für Markierungen, die blinde und sehbehinderte Menschen mit dem ' +
    'Stock ertasten und mit dem Restsehvermögen erkennen.', gilt: NORM },
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
  // nur externe Werke (Nutzerentscheid 23.10.2026): Projektentscheide erklärt die Begriffsliste
  return WERK_IDS.filter(x => w.has(x) && x !== 'ENTSCHEID')
}

/** Beschreibung eines Werks: was es ist, dazu (ausser bei Normen) wie verbindlich */
export const werkText = (w: WerkId): string => [WERK_INFO[w].was, WERK_INFO[w].gilt].filter(Boolean).join(' ')

/** voller bzw. amtlicher Titel eines Werks (nur Verzeichnisse und Tooltips; im Lesetext der Lesename) */
export const werkVoll = (w: WerkId): string => WERKE[w].voll
/** Tooltip eines Werks: voller Titel, dann die Beschreibung */
export const werkTooltip = (w: WerkId): string => `${werkVoll(w)}. ${werkText(w)}`

export interface WerkLink {
  url: string
  /** Seite des Herausgebers (Webseite) bzw. das Dokument als PDF */
  art: 'seite' | 'pdf'
  /** Text des Links: «Seite» bzw. «PDF, 0,2 MB» */
  text: string
}
const mbText = (mb: number): string => `${String(mb).replace('.', ',')} MB`
/** externe Adressen eines Werks beim Herausgeber: zuerst die Seite, dann das PDF mit Grösse (leer: kein Link) */
export function werkLinks(w: WerkId): WerkLink[] {
  const x = WERKE[w], aus: WerkLink[] = []
  if (x.seite) aus.push({ url: x.seite, art: 'seite', text: 'Seite' })
  if (x.pdf) aus.push({ url: x.pdf.url, art: 'pdf', text: `PDF, ${mbText(x.pdf.mb)}` })
  return aus
}
/** Vermerk zum Bezug: Normen «kostenpflichtig», Link auf ein zitierendes Werk bzw. ohne Adresse «beim Herausgeber erhältlich» */
export function werkBezug(w: WerkId): string | null {
  const x = WERKE[w]
  if (x.bezug) return x.bezug
  return x.seite || x.pdf || w === 'ENTSCHEID' ? null : 'beim Herausgeber erhältlich'
}

// ── Fundstellen lesbar (Nutzertest 23.10.2026) ──

/** Name eines Werks im Lesetext: verständlich, ohne Ausgabe und Kennungen (die stehen im Quellenverzeichnis) */
export const LESENAME: Readonly<Record<WerkId, string>> = {
  '40241': 'VSS-Norm 40 241 Fussgängerstreifen', '40240': 'VSS-Norm 40 240 Querungsanlagen', '40242': 'VSS-Norm 40 242 Trottoirüberfahrten',
  '40837': 'VSS-Norm 40 837 Lichtsignalanlagen', '40273': 'VSS-Norm 40 273 Sicht in Knoten', '40213': 'VSS-Norm 40 213 Verkehrsberuhigungselemente',
  '640075': 'Norm SN 640 075 Hindernisfreier Verkehrsraum', '640850a': 'Norm SN 640 850a Markierungen',
  '640852': 'Norm SN 640 852 Taktil-visuelle Markierungen',
  VOT30: 'Tempo-30-Zonen-Verordnung (SR 741.213.3)', SSV: 'Signalisationsverordnung (SSV)', VRV: 'Verkehrsregelnverordnung (VRV)',
  MP: 'Masterplan Fussverkehr Stadt Bern', MPV: 'Masterplan Veloinfrastruktur Stadt Bern', HBLSA: 'Handbuch Lichtsignalanlagen Stadt Bern',
  AHBE: 'Arbeitshilfe Fussgängerstreifen Kanton Bern', BFU: 'bfu-Fachdokumentation «Fussgängerstreifen»',
  BFU2016: 'ältere bfu-Fachdokumentation (2016)', HA: 'Richtlinie «Strassen – Wege – Plätze»', VCS: 'VCS-Leitfaden «Sichere Querungen»',
  ENTSCHEID: 'Projektentscheid fgsCheck',
}

/** Abkürzungen der Fundstellen ausgeschrieben: «Z. 24» → «Ziffer 24», «Tab. 1» → «Tabelle 1», «S. 60» → «Seite 60» («Abs.» bleibt) */
export function abkLesbar(t: string): string {
  return t.replace(/\bZiff\. ?/g, 'Ziffer ').replace(/\bZ\. ?(?=\d)/g, 'Ziffer ').replace(/\bTab\. ?/g, 'Tabelle ')
    .replace(/\bAnh\. ?/g, 'Anhang ').replace(/\bS\. (?=\d)/g, 'Seite ').replace(/\bKap\. ?/g, 'Kapitel ').replace(/\bBst\. ?/g, 'Buchstabe ')
    .replace(/\bvia Weisung FL\b/g, 'über die Weisung Liechtenstein')
}

/** eine Fundstelle lesbar: «Tempo-30-Zonen-Verordnung (SR 741.213.3), Art. 4 Abs. 2», «VSS-Norm 40 241 Fussgängerstreifen, Ziffer 24» */
export const fundstelleText = (q: { werk: string; ziffer: string }): string =>
  `${LESENAME[q.werk as WerkId] ?? q.werk}${q.ziffer ? `, ${abkLesbar(q.ziffer)}` : ''}`
/** Fundstellen einer Regel lesbar, mit «; » getrennt */
export const fundstellenText = (id: string): string => (DEF[id]?.quellen ?? []).map(fundstelleText).join('; ')
/** erste Fundstelle einer Regel lesbar (Begründung) */
export const fundstelleKurz = (id: string): string => { const q = DEF[id]?.quellen[0]; return q ? fundstelleText(q) : '' }

/**
 * Direkter Link zur Fundstelle, wo frei verfügbar: Bundesrecht auf den Artikel in fedlex (Anker «#art_4», geprüft in der
 * HTML-Fassung des Filestore), Masterpläne Bern auf die PDF-Seite («#page=60», gedruckte Seitenzahl = PDF-Seite geprüft). Sonst null.
 */
export function fundstelleLink(q: { werk: string; ziffer: string }): WerkLink | null {
  const w = WERKE[q.werk as WerkId]
  if (!w) return null
  const art = /^Art\. (\d+)([a-z]?)/.exec(q.ziffer)
  if (art && w.seite?.includes('fedlex.admin.ch')) return { url: `${w.seite}#art_${art[1]}${art[2] ? `_${art[2]}` : ''}`, art: 'seite', text: `Art. ${art[1]}${art[2]}` }
  const seite = /^S\. (\d+)/.exec(q.ziffer)
  if (seite && w.pdf && (q.werk === 'MP' || q.werk === 'MPV')) return { url: `${w.pdf.url}#page=${seite[1]}`, art: 'pdf', text: `PDF, Seite ${seite[1]}` }
  return null
}

/** Normen behalten im Lesetext ihren Kurznamen («VSS 40 241»), die übrigen Werke heissen mit dem Lesenamen */
const IST_NORM = (w: WerkId): boolean => /^(VSS|SN) /.test(WERKE[w].name)
const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Werknamen im Text: Lesenamen und Kurznamen mit Ausgabe («VSS 40 241:2019», «bfu MS.013-2025»); nicht «VCS», «fgsCheck» allein */
const MUSTER: [string, WerkId, boolean][] = [
  ...WERK_IDS.map(w => [escRe(LESENAME[w]), w, true] as [string, WerkId, boolean]),
  ...WERK_IDS.filter(w => !['VCS', 'ENTSCHEID', 'BFU2016'].includes(w))
    .map(w => [`${escRe(WERKE[w].name)}(?:[: -]\\d{4}(?:-\\d{2}){0,2})?`, w, false] as [string, WerkId, boolean]),
].sort((a, b) => b[0].length - a[0].length)
const WERK_RE = new RegExp(`(?<![\\wäöü])(${MUSTER.map(m => m[0]).join('|')})(,? (Art\\. \\d+[a-z]?(?: Abs\\. \\d+)?(?: Buchstabe [a-z])?))?`, 'g')

/** Teil eines Lesetexts: Text bzw. Werk (Anzeige, Werk, Artikel-Link zu fedlex) */
export type VerweisTeil = { text: string } | { werk: WerkId; anzeige: string; ziffer?: { text: string; link: WerkLink | null } }

/**
 * Lesetext mit Werkverweisen (Nutzertest 23.10.2026): Abkürzungen ausgeschrieben, Werknamen erkannt (Normen mit Kurzname, übrige
 * mit Lesename, z. B. «bfu MS.013-2025» → «bfu-Fachdokumentation «Fussgängerstreifen»»); ein Artikel dahinter mit Link zu fedlex
 */
export function verweisTeile(text: string): VerweisTeil[] {
  const t = abkLesbar(text), aus: VerweisTeil[] = []
  let i = 0
  for (const m of t.matchAll(WERK_RE)) {
    const roh = m[1]
    let w = MUSTER.find(x => new RegExp(`^(?:${x[0]})$`).test(roh))![1]
    if (w === 'BFU' && /2016/.test(roh)) w = 'BFU2016'
    if (m.index! > i) aus.push({ text: t.slice(i, m.index) })
    const anzeige = IST_NORM(w) ? roh.replace(/[: -]\d{4}(?:-\d{2}){0,2}$/, '') : LESENAME[w]
    const art = m[3]
    aus.push({ werk: w, anzeige, ...(art ? { ziffer: { text: art, link: fundstelleLink({ werk: w, ziffer: art }) } } : {}) })
    i = m.index! + m[0].length
  }
  if (i < t.length) aus.push({ text: t.slice(i) })
  return aus
}
/** Lesetext ohne Verweise (Bericht, Tests): wie verweisTeile, als Zeichenkette */
export const verweisText = (text: string): string =>
  verweisTeile(text).map(x => ('text' in x ? x.text : `${x.anzeige}${x.ziffer ? `, ${x.ziffer.text}` : ''}`)).join('')
