// ── Bedarfsmodul E1: Befundblatt (reine Funktion zwischen Rechnung + Eingaben und Anzeige) ──
//
// Je Querung (Teilstreifen auf einer Achse): Vorbelegung aus der Rechnung (vorbelegung.ts) und Handeingaben des Falls
// (fallBedarf.ts) bilden die Eingaben; der Entscheidbaum (entscheid.beurteile) liefert Querungstyp und Befunde, mit den Ebenen
// Bern bzw. Kanton BE nach dem Ort (von Hand schaltbar). Die Sicht kommt aus dem Sichtrechner (Skizze: «Sicht bleibt der letzte
// Schritt»): ist keine vorhandene Sichtweite von Hand eingegeben, ersetzt sein Ergebnis die Regeln H1 (Fussgängerstreifen) bzw.
// E3 (Querung ohne Vortritt, VSS 40 240 Z. 8.2) des Baums – je Zufahrt verdeckt = Befund, frei = erfüllt. Die Regeln H1/E3 des
// Baums kennen weder «bis Knoten» noch Kurvenradien der Rechnung und würden deren Sichtweiten falsch werten.
// Offene Einträge stehen nach fehlendem Feld und Block der Maske; Blöcke ganz ohne Eingaben als «nicht geprüft».

import { beurteile } from './entscheid'
import { KATALOG, WERKE, quellText, type RegelId, type WerkId } from './katalog'
import type { Befund, Eintrag, Liste, MassZeile } from './typen'
import { eingabenBilden, ebenenWirksam, type Gebildet } from './fallBedarf'
import { querungen, vorbelegen, streifenTyp, type QuerungGruppe, type Vorbelegt } from './vorbelegung'
import { FELD_DEFS, GRUPPEN, feldName, gruppeVon, gruppenName, type GruppeId } from './felder'
import { ahs } from './tabellen'
import { grundpruefung, type Grundpruefung } from './grundpruefung'
import { ausgeblendeteBloeckeLeeren } from './feldhilfen'
import { regelName, regelTitel } from './regelname'
import type { Querungstyp } from './eingaben'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import type { Fall } from '../fall'
import type { P } from '../geo'

export interface BlattOptionen {
  /** Vorgabe der Ebenen nach dem Ort (fallBedarf.ebenenVorgabe) */
  vorgabe: { bern: boolean; kantonBE: boolean }
  /** angenommene Inseln der Rechnung (nach OSM und Luftbild) */
  inseln?: { ring: P[] }[]
  /** Name eines Streifens bzw. einer Zufahrt für die Anzeige (App: benennung.ts) */
  titel?: (fgsId: string) => string
  zufahrt?: (fgsId: string, zufahrt: string) => string
}

/** Sicht je Zufahrt aus dem Sichtrechner */
export interface SichtZeile {
  fgsId: string; zufahrt: string; name: string; regel: 'H1' | 'E3'
  tempo: number; soll: number; quelle: string; frei: boolean; status: string
  /** nur bis hier geprüft (Querung ohne Vortritt über der Reichweite der geladenen Daten) */
  bisM?: number
}
export interface OffenZeile { feld: string; name: string; gruppe: GruppeId | null; regeln: string[] }

export interface BefundBlatt {
  gruppe: string
  streifen: string[]
  titel: string
  befund: Befund
  gebildet: Gebildet
  vorbelegt: Vorbelegt
  ebenen: { bern: boolean; kantonBE: boolean; richtlinie: boolean }
  /** Sicht aus dem Sichtrechner (leer, wenn sie von Hand eingegeben ist bzw. nicht passt) */
  sicht: SichtZeile[]
  sichtVonHand: boolean
  /** Empfohlener Querungstyp mit Elementen als Text */
  typText: string
  /** Zulässigkeit eines Fussgängerstreifens als Text */
  zulText: string
  /** eine Zeile Begründung mit Ziffern */
  begruendung: string
  offen: OffenZeile[]
  nichtGeprueft: { block: string; grund: string }[]
  annahmen: string[]
  /** Hinweise zur Vorbelegung und Bildung */
  hinweise: string[]
  /** Grundprüfung nach bfu (Big Five), unabhängig von den Ebenen */
  grund: Grundpruefung
}

const leer = (): Liste => ({ verletzungen: [], bericht: [], empfehlungen: [], hinweise: [], offen: [] })
const LOKAL = ['Bern', 'Kanton BE']

/** kurze Fundstelle einer Regel: erstes Werk und Ziffer, z. B. «VSS 40 241 Z. 24» */
export function kurzQuelle(id: string): string {
  const d = KATALOG[id as RegelId]
  const q = d?.quellen[0]
  return q ? `${WERKE[q.werk as WerkId].name} ${q.ziffer}` : ''
}

/** Empfohlener Querungstyp als Text */
export function typText(b: Befund): string {
  const e = b.empfehlung, el = e.elemente
  const mit = (x: string[]) => (x.length ? `${x[0]}${x.length > 1 ? ` mit ${x.slice(1).join(' und ')}` : ''}` : '')
  let t: string
  switch (e.typ) {
    case 'Q1': case 'Q2': t = mit(el.map((x, i) => (i ? DATIV[x] ?? x : x))); break
    case 'Q3': t = 'Trottoirüberfahrt'; break
    case 'furt': t = `Querung ohne Vortritt: ${el.join(', ')}; kein Fussgängerstreifen`; break
    case 'ohne_vortritt': t = `Querung ohne Vortritt: ${el.join(', ')}; kein Fussgängerstreifen`; break
    case 'flaechig': t = `Flächige Querung: ${el.join(', ')}`; break
    default: t = b.ende === 'ausserorts' ? 'Ausserorts: nicht beurteilt' : 'Nicht beurteilt: Eingaben fehlen (innerorts bzw. ausserorts)'
  }
  if (e.vorlaeufig) t += ` (vorläufig: offen ${e.offenWegen.length ? `wegen ${e.offenWegen.map(feldOderRegel).join(', ')}` : 'ist die Zulässigkeit'})`
  return t
}
/** Elemente nach «mit» (Dativ) */
const DATIV: Record<string, string> = { 'vorgezogener Seitenraum': 'vorgezogenem Seitenraum' }
const feldOderRegel = (x: string): string => (x in KATALOG ? regelName(x) : feldName(x))

const ZUL: Record<string, string> = {
  zulaessig: 'Fussgängerstreifen zulässig', mit_begruendung: 'Fussgängerstreifen zulässig mit Begründung',
  nicht_angezeigt: 'Fussgängerstreifen nicht angezeigt', offen: 'Zulässigkeit offen',
}

/** Regel mit Kurztitel, Nummer und Fundstelle, z. B. «Insel bei breiter Fahrbahn (D2, VSS 40 241 Z. 24)» */
const regelVerweis = (id: string): string => `${regelTitel(id)} (${id}, ${kurzQuelle(id)})`

/** Begründung in einer Zeile: Zulässigkeit, Regeln für den Typ mit Fundstelle */
export function begruendung(b: Befund): string {
  const teile: string[] = []
  if (b.zulaessigkeit) {
    const ids = b.alle.filter(x => x.zustand === 'verletzt' && ['C1', 'C2', 'C2b', 'C3', 'C3b', 'C4'].includes(x.id)).map(x => x.id)
    teile.push(`${ZUL[b.zulaessigkeit]}${ids.length ? ` (${ids.map(regelVerweis).join('; ')})` : ''}`)
  }
  const gr = b.empfehlung.grundlage.filter(id => !['C1', 'C2'].includes(id))
  if (gr.length) teile.push(`Typ nach ${gr.map(regelVerweis).join('; ')}`)
  else if (b.empfehlung.typ === 'Q1') teile.push(b.empfehlung.elemente.includes('Schutzinsel') ? 'Schutzinsel vorhanden; keine Regel verlangt ein Lichtsignal'
    : 'keine Regel verlangt Insel oder Lichtsignal')
  return teile.join('. ')
}

function statusKurz(z: ZufahrtErgebnis): string {
  if (z.status === 'frei') return 'frei'
  const arten = [...new Set(z.konflikte.map(k => k.layer))].slice(0, 3)
  return `verdeckt${arten.length ? ` (${arten.join(', ')})` : ''}`
}

/** Liste und Gruppen neu aus «alle» (nach dem Ersetzen der Sicht) */
function neuOrdnen(b: Befund): void {
  const norm = leer(), lokal = leer()
  for (const x of b.alle) {
    const l = LOKAL.includes(x.ebene) ? lokal : norm
    if (x.zustand === 'offen') l.offen.push(x)
    else if (x.staerke === 'hart') l.verletzungen.push(x)
    else if (x.staerke === 'hart_bericht') l.bericht.push(x)
    else if (x.staerke === 'weich') l.empfehlungen.push(x)
    else l.hinweise.push(x)
  }
  b.norm = norm; b.lokal = lokal
  const m = new Map<string, string[]>()
  for (const x of b.alle) if (x.zustand === 'offen') for (const f of x.fehlend ?? []) m.set(f, [...(m.get(f) ?? []), x.id])
  b.offenGruppen = [...m].map(([feld, regeln]) => ({ feld, regeln })).sort((a, c) => c.regeln.length - a.regeln.length)
}

const OHNE_VORTRITT = ['furt', 'ohne_vortritt']
/** Typen, die aus den Streifen folgen */
const STREIFEN_TYPEN = ['fgs', 'lsa', 'furt', 'ohne_vortritt']
const TYP_TEXT: Record<string, string> = { fgs: 'Fussgängerstreifen', lsa: 'Fussgängerstreifen mit Lichtsignal', furt: 'Furt',
  ohne_vortritt: 'Querung ohne Vortritt' }

/** Befundblatt einer Querung */
export function befundblatt(g: QuerungGruppe, fall: Fall, opt: BlattOptionen): BefundBlatt {
  const titel = opt.titel ?? ((id: string) => id)
  const zName = opt.zufahrt ?? ((_: string, z: string) => z)
  const vorbelegt = vorbelegen(g, fall, opt.inseln ?? [])
  const gebildet = eingabenBilden(vorbelegt.werte, fall.bedarf)
  // Querungstyp Fussgängerstreifen bzw. ohne Vortritt folgt aus den Streifen (Querungsart, Lichtsignal); eine abweichende
  // Handeingabe dieser Typen gilt nicht (die Rechnung prüft die Streifen nach ihrer Querungsart). Trottoirüberfahrt und
  // Mehrzweckstreifen bleiben Handeingaben
  const vorTyp = vorbelegt.werte.typ, handTyp = fall.bedarf?.felder.typ?.wert as string | undefined
  const typHinweis: string[] = []
  if (vorTyp && handTyp && STREIFEN_TYPEN.includes(handTyp) && handTyp !== vorTyp.wert) {
    gebildet.eingaben.typ = { wert: vorTyp.wert as Querungstyp, quelle: vorTyp.quelle }
    const h = gebildet.herkunft.get('typ')
    if (h) gebildet.herkunft.set('typ', { ...h, text: `${h.text}, übergangen: es gilt die Querungsart der Streifen (${vorTyp.text})` })
    typHinweis.push(`Querungstyp im Bedarf (${TYP_TEXT[handTyp]}) widerspricht der Querungsart der Streifen: es gilt ${TYP_TEXT[vorTyp.wert as string]}`)
  }
  const ebenen = ebenenWirksam(fall.bedarf, opt.vorgabe)
  // ausgeblendete Unterfelder lösen die Blöcke Trottoirüberfahrt bzw. LSA-Zeiten nicht aus (Feldhilfen, SICHTBAR)
  ausgeblendeteBloeckeLeeren(gebildet.eingaben, ebenen)
  const befund = beurteile(gebildet.eingaben, { ebenen: { bern: ebenen.bern, kantonBE: ebenen.kantonBE, richtlinie: ebenen.richtlinie } })
  const hinweise = [...typHinweis, ...vorbelegt.hinweise, ...gebildet.hinweise]

  // Sicht aus dem Sichtrechner statt H1/E3, solange keine vorhandene Sichtweite von Hand eingegeben ist
  const sichtVonHand = gebildet.eingaben.sichtVorh.wert !== null
  const sicht: SichtZeile[] = []
  if (!sichtVonHand) {
    const typ = gebildet.eingaben.typ.wert
    befund.alle = befund.alle.filter(x => !['H1', 'E3', 'E3a', 'D5-4'].includes(x.id))
    befund.masse = befund.masse.filter(mz => !mz.regeln.some(id => ['H1', 'E3'].includes(id)))
    const neu: Eintrag[] = []
    const eintrag = (regel: 'H1' | 'E3', x: Partial<Eintrag> & Pick<Eintrag, 'zustand' | 'staerke'>): Eintrag =>
      ({ id: regel, ebene: 'Norm', text: KATALOG[regel].ergebnis, quelle: quellText(regel), ...x })
    for (const s of g.streifen) {
      const st = streifenTyp(s)
      if (st === 'kein') continue
      const ov = OHNE_VORTRITT.includes(st)
      const regel: 'H1' | 'E3' = ov ? 'E3' : 'H1'
      // Fussgängerstreifen mit Lichtsignal: VSS 40 241 gilt nicht (kein H1), Sichtrechner nur zur Information
      if (!ov && s.lsa === 'ja') {
        const zu = s.zufahrten.filter(z => z.status !== 'frei').length
        hinweise.push(`${titel(s.fgsId)}: mit Lichtsignal gilt die Sichtweite nach VSS 40 241 nicht (kein Befund H1); Sichtrechner zur ` +
          `Information: ${zu ? `${zu} von ${s.zufahrten.length} Zufahrten verdeckt` : 'alle Zufahrten frei'}`)
        continue
      }
      // Querungstyp, den der Sichtrechner nicht prüft (Trottoirüberfahrt, Mehrzweckstreifen) bzw. der nicht zur Querungsart passt
      if (typ !== null && (OHNE_VORTRITT.includes(typ) !== ov || ['trottoirueberfahrt', 'mehrzweck'].includes(typ))) {
        neu.push(eintrag(regel, { staerke: 'hart', zustand: 'offen', fehlend: ['sichtVorh'],
          detail: `${titel(s.fgsId)}: Sicht des Sichtrechners (${ov ? 'ohne Vortritt' : 'Fussgängerstreifen'}) gilt nicht für den Querungstyp ` +
            'im Bedarf; vorhandene Sichtweite von Hand eingeben' }))
        continue
      }
      if (!s.zufahrten.length) neu.push(eintrag(regel, { staerke: 'hart', zustand: 'offen', fehlend: ['Zufahrten'],
        detail: `${titel(s.fgsId)}: keine Zufahrt geprüft` }))
      for (const z of s.zufahrten) {
        const frei = z.status === 'frei'
        const bis = z.geprueftBisM
        sicht.push({ fgsId: s.fgsId, zufahrt: z.zufahrt, name: zName(s.fgsId, z.zufahrt), regel, tempo: z.tempo, soll: z.sichtweite,
          quelle: z.sichtweiteQuelle, frei, status: statusKurz(z), ...(bis !== undefined ? { bisM: bis } : {}) })
        const soll = `${String(z.sichtweite).replace('.', ',')} m frei (${z.sichtweiteQuelle})`
        const wo = `${titel(s.fgsId)}, ${zName(s.fgsId, z.zufahrt)}`
        if (frei && bis === undefined) continue
        if (frei) {
          // Soll über der Reichweite der geladenen Daten: offen, nicht erfüllt
          neu.push(eintrag(regel, { staerke: 'hart', zustand: 'offen', fehlend: ['sichtVorh'], ist: `frei bis ${bis} m`, soll,
            detail: `${wo}: Sichtfeld bis ${bis} m frei, darüber nicht geprüft (Reichweite der geladenen Daten)` }))
          continue
        }
        // verdeckt: ohne Vortritt hart nur, wenn schon die geprüfte Strecke höchstens die Anhaltesichtweite ist; sonst weich, bis eine
        // zweite Prüfung bis zur Anhaltesichtweite folgt (E2)
        const geprueft = Math.min(z.sichtweite, bis ?? Infinity)
        const hart = !ov || geprueft <= ahs(z.tempo) + 1e-9
        neu.push(eintrag(regel, { staerke: hart ? 'hart' : 'weich', zustand: 'verletzt', ist: statusKurz(z), soll,
          detail: `${wo}: Sichtfeld ${bis !== undefined ? `bis ${bis} m ` : 'bis zur Soll-Sichtweite '}nicht frei (Sichtrechner)` +
            (ov && !hart ? `; ob die Anhaltesichtweite (${ahs(z.tempo)} m) frei bleibt, ist nicht getrennt geprüft: Befund vorerst weich` : '') }))
      }
    }
    befund.alle.push(...neu)
    if (neu.some(x => x.zustand === 'verletzt')) befund.alle.push({ id: 'D5-4', ebene: 'Norm', staerke: 'hinweis', zustand: 'verletzt',
      text: KATALOG['D5-4'].ergebnis, quelle: quellText('D5-4') })
    if (sicht.length) {
      const zahl = sicht.filter(x => !x.frei).length, teil = sicht.filter(x => x.frei && x.bisM !== undefined).length
      const mz: MassZeile = { groesse: 'Sichtweite (Sichtrechner)', einheit: 'm',
        soll: [...new Set(sicht.map(x => String(x.soll).replace('.', ',')))].join('; '),
        ist: zahl ? `verdeckt (${zahl} von ${sicht.length} Zufahrten)` : teil ? `frei, ${teil} von ${sicht.length} Zufahrten nur bis ` +
          `${sicht.find(x => x.bisM !== undefined)!.bisM} m geprüft` : `frei (${sicht.length} Zufahrten)`,
        zustand: zahl ? 'verletzt' : teil ? 'offen' : 'erfuellt', regeln: [...new Set(sicht.map(x => x.regel))] }
      befund.masse.push(mz)
    }
    neuOrdnen(befund)
  }

  // offen nach Feld und Block; Blöcke ganz ohne Eingabe: nicht geprüft
  const mitEingabe = new Set<GruppeId>()
  for (const d of FELD_DEFS) if (gebildet.herkunft.get(d.pfad)?.zustand !== 'offen') mitEingabe.add(d.gruppe)
  const offen: OffenZeile[] = [], ohne = new Map<GruppeId, Set<string>>()
  for (const o of befund.offenGruppen) {
    const gr = gruppeVon(o.feld)
    if (gr && !mitEingabe.has(gr)) { for (const r of o.regeln) ohne.set(gr, (ohne.get(gr) ?? new Set()).add(r)); continue }
    offen.push({ feld: o.feld, name: o.feld === 'Zufahrten' ? 'geprüfte Zufahrten' : feldName(o.feld), gruppe: gr, regeln: o.regeln })
  }
  const nichtGeprueft = [
    ...befund.nichtGeprueft.map(x => ({ block: x.block === 'Q3' ? 'Trottoirüberfahrt' : 'LSA-Zeiten', grund: x.grund })),
    ...GRUPPEN.filter(gr => ohne.has(gr.id) && !(gr.id === 'q3' && befund.nichtGeprueft.some(x => x.block === 'Q3')) &&
      !(gr.id === 'lsa' && befund.nichtGeprueft.some(x => x.block === 'I')))
      .map(gr => ({ block: gr.name, grund: `keine Eingaben (${ohne.get(gr.id)!.size} Regeln offen)` })),
  ]

  // Annahmen mit Beschriftung und Herkunft
  const annahmen = befund.annahmen.map(a => {
    const m = /^(\w+): (Annahme|Schätzung)$/.exec(a)
    if (!m) return a
    if (m[1] === 'fgQuelle') return ''
    const h = gebildet.herkunft.get(m[1]) ?? [...gebildet.herkunft].find(([p]) => p.startsWith(`${m[1]}.`))?.[1]
    return `${feldName(m[1])}: ${m[2]}${h && h.zustand === 'vorbelegt' ? ` (${h.text})` : ''}`
  }).filter(Boolean)

  // Grundprüfung bfu: Sicht des Sichtrechners je Zufahrt der Fussgängerstreifen (nicht ohne Vortritt, nicht mit Lichtsignal); ein
  // Fussgängerstreifen ohne geprüfte Zufahrt lässt die Sicht offen; Teilstreifen teils mit, teils ohne Vortritt: gilt nicht
  const arten = new Set(g.streifen.map(streifenTyp).filter(t => t !== 'kein'))
  const grund = grundpruefung(gebildet.eingaben, {
    sicht: sicht.filter(x => x.regel === 'H1').map(x => ({
      name: g.streifen.length > 1 ? `${titel(x.fgsId)}, ${x.name}` : x.name, tempo: x.tempo, soll: x.soll, quelle: x.quelle, frei: x.frei,
      status: x.status, abbiegend: x.zufahrt.startsWith('a'), ...(x.bisM !== undefined ? { bisM: x.bisM } : {}) })),
    ohneZufahrt: g.streifen.filter(s => streifenTyp(s) === 'fgs' && s.lsa !== 'ja' && !s.zufahrten.length).map(s => titel(s.fgsId)),
    gemischt: arten.has('fgs') && [...arten].some(t => OHNE_VORTRITT.includes(t)),
  })

  return {
    grund,
    gruppe: g.id, streifen: g.streifen.map(s => s.fgsId), titel: g.streifen.map(s => titel(s.fgsId)).join(' und '),
    befund, gebildet, vorbelegt, ebenen, sicht, sichtVonHand, typText: typText(befund),
    zulText: befund.zulaessigkeit ? ZUL[befund.zulaessigkeit] : '', begruendung: begruendung(befund), offen, nichtGeprueft, annahmen,
    hinweise: [...new Set(hinweise)],
  }
}

/** Befundblätter aller Querungen einer Rechnung */
export function befundblaetter(r: { streifen: StreifenErgebnis[]; inseln?: { ring: P[] }[] }, fall: Fall, opt: BlattOptionen): BefundBlatt[] {
  return querungen(r.streifen).map(g => befundblatt(g, fall, { ...opt, inseln: opt.inseln ?? r.inseln ?? [] }))
}

export { gruppenName }
