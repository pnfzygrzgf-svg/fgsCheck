// ── Massnahmen bei ungenügender Knotensichtweite (VSS 40 273 Ziffer 14; E3a) ──
//
// Nur wenn mindestens eine Richtung «nicht erfüllt» ist. In der Reihenfolge der Ziffer 14, je mit Rechnung und Ergebnis «reicht»
// bzw. «reicht nicht» oder als Vermerk. Gerechnet werden nur Varianten der bestehenden Rechnung (rechnen.ts liefert sie über
// MassnahmenEingang.variante): andere Lage von D, ein Hindernis weniger, tieferes Tempo. «Reicht» heisst: jede Richtung mit Verkehr
// erreicht den massgebenden Wert. Die Massnahmen ändern die Rechnung nicht, bis der Nutzer eine als Eingabe übernimmt.
// 1 Hindernis entfernen: je Verdecker bis A (ohne Gebäude der AV, nicht verhältnismässig; ohne «nur Hinweis»), Achse unverändert.
// 2 Haltelinie vorverlegen (nur bestehende Anlagen): D ab der heutigen Kante (bzw. Trottoirhinterkante) in Schritten von
//   HALTELINIE_SCHRITT_M näher an die Kante, bis HALTELINIE_MIN_M; die erste Lage, an der beide Richtungen reichen.
// 3 «Stop»: nur ausserorts mit Wirkung (B 5,00 auf 3,00 m, Ziffer 12). 4 Rechtsabbiegegebot: wenn nur nach links ausreichend.
// 5 Tempo senken: nächsttiefere Stufen der Tab. 1 (mit Anhaltesichtweite) bis es reicht. 6 Lichtsignalanlage: Vermerk.
// 7 Spiegel: nur wenn 2 bis HALTELINIE_MIN_M nicht reicht; Bedingungen als Häkchen (die App zählt nur). 8 Aufhebung der Ausfahrt:
// Vermerk bei Grundstückzufahrten.
// E3b: der Velo-Teil zählt mit (Entscheid 1): eine Richtung ist «nicht erfüllt», wenn Auto oder Velo nicht erfüllt sind; jede
// Variante rechnet auch die Veloachse (ein tieferes Tempo gilt dort als zulässige Höchstgeschwindigkeit der Tab. 3), «reicht» heisst
// Auto und Velo reichen. Der Trottoirverkehr (Tab. 2) ist nicht Teil der Liste.
// E3c, Rechtsvortritt: zuoberst (Nr. 0) «Rechtsvortritt aufheben und Vortritt signalisieren» (Fundstelle VSS 40 273 Ziffer 16,
// nicht 17), wenn der Zustand nach Abb. 6 «zu sanieren» bzw. das Sichtfeld nach Abb. 5 nicht frei ist. «Reicht» heisst dann: nicht
// mehr «zu sanieren» und Paarmatrix frei. Haltelinie, Stop, Rechtsabbiegegebot, Tempo und Spiegel passen nicht zum Rechtsvortritt (B 5,00 m nach Abb. 4, Tempo fest
// 30 km/h nach Ziffer 15): nur Vermerk bzw. weggelassen.

import type { P } from '../geo'
import type { Lage, Richtung, RichtungErgebnis, Regelung } from './typen'
import { lageNach, lageWort } from './lage'
import { TAB1_STUFEN } from './sichtweite'

/** Haltelinie vorverlegen: Schritt und kleinste Beobachtungsdistanz ab der Kante [m] (Ziffer 14, darunter nur Spiegel) */
export const HALTELINIE_SCHRITT_M = 0.25
export const HALTELINIE_MIN_M = 1.5
/** Spiegel: Abstand Haltelinie–Spiegel unter diesem Wert [m], Tempo höchstens SPIEGEL_TEMPO_MAX [km/h] (Ziffer 14) */
export const SPIEGEL_ABSTAND_M = 15
export const SPIEGEL_TEMPO_MAX = 60
/** Bedingungen für einen Spiegel (Ziffer 14) zum Abhaken; die erste (B unter 1,50 m) prüft die App selbst */
export const SPIEGEL_BEDINGUNGEN: [string, string][] = [
  ['stop', 'nur mit «Stop» bzw. an einer Grundstückzufahrt'],
  ['abstand', `Abstand Haltelinie–Spiegel unter ${SPIEGEL_ABSTAND_M} m`],
  ['verkehr', 'schwacher Verkehr auf der vortrittsbelasteten Strasse'],
  ['tempo', `zulässige Höchstgeschwindigkeit auf der Vortrittsstrasse höchstens ${SPIEGEL_TEMPO_MAX} km/h`],
  ['standort', 'Standort des Spiegels gesichert (Grundeigentum bzw. Bewilligung)'],
  ['winter', 'Spiegel funktioniert auch im Winter'],
]

/** Übernahme einer Massnahme als Eingabe (Knopf «übernehmen») */
export type Uebernahme = { art: 'haltelinie'; p: P } | { art: 'tempo'; richtung: Richtung; wert: number } | { art: 'stop' }

export interface MassnahmeZeile {
  text: string
  reicht: boolean | null      // null = ohne Rechnung
  id?: string                 // Hindernis (Klick hebt es auf der Karte hervor)
  uebernehmen?: Uebernahme
}
export interface Massnahme {
  nr: number                  // 1 … 8, Reihenfolge der Ziffer 14 (Plan E3a)
  titel: string
  reicht: boolean | null      // null = Vermerk ohne Rechnung bzw. nicht anwendbar
  text: string
  zeilen: MassnahmeZeile[]
  bedingungen?: [string, string][]   // Spiegel: Häkchenliste
  sichtUnterMin?: boolean     // Spiegel: direkte Sicht erst bei D unter HALTELINIE_MIN_M (gerechnet; false = nicht geprüft)
}

/** Ergebnis einer Variante je Richtung mit Verkehr */
export interface VarianteRichtung { richtung: Richtung; lage: Lage; vorhanden: number; massgebend: number; reicht: boolean; tempo: number
  velo?: { vorhanden: number; massgebend: number; reicht: boolean } | null
  paareFrei?: boolean         // Rechtsvortritt, schmale Zufahrt: Paarmatrix nach Abb. 5 frei (E3c)
  nurVelo?: boolean           // E4: Velo gegen die Einbahn, von dieser Seite keine Motorfahrzeuge (vorhanden, massgebend: die des Velos)
}
/** Variante der bestehenden Rechnung: D an anderer Lage, ohne ein Hindernis, anderes Tempo je Richtung */
export interface Variante { D?: P; ohne?: string[]; tempo?: Partial<Record<Richtung, number>> }

export interface MassnahmenEingang {
  richtungen: RichtungErgebnis[]
  variante: (v: Variante) => VarianteRichtung[]
  /** D und Haltelinie, wenn D b Meter hinter dem Bezug (Kante bzw. Trottoirhinterkante) steht; null = D von Hand (nicht gerechnet) */
  haltelinie: { dHeute: number; bezug: string; lage: (b: number) => { D: P; haltelinie: P } } | null
  /** D bei B = 3,00 m ab dem heutigen Nullpunkt (Stop ausserorts); null = D von Hand */
  dStop: P | null
  ausserorts: boolean
  regelung: Regelung
  grundstueck: boolean
  /** Rechtsvortritt (E3c): aufheben = zu sanieren bzw. Sichtfeld nach Abb. 5 nicht frei; null = kein Rechtsvortritt */
  rechtsvortritt?: { aufheben: boolean; verdecker: { id: string; name: string; art: string; quelle: string }[]
    wahrnehmbarkeit: string[] } | null   // Zustand nach Abb. 6 je Wahrnehmbarkeit bei der vorhandenen Sichtweite (Zeilen)
}

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')
/** mit Verkehr: Motorfahrzeuge bzw. (E4, Velo gegen die Einbahn) nur Velos */
const mitVerkehr = (r: RichtungErgebnis) => r.status !== 'keine_zufahrt' || !!r.velo
/** Auto bzw. Velo nicht erfüllt (E3b) */
const nicht = (r: RichtungErgebnis) => r.status === 'nicht_erfuellt' || r.velo?.status === 'nicht_erfuellt'
const ok = (r: RichtungErgebnis) => (r.status === 'erfuellt' || r.status === 'massgebend' || (r.status === 'keine_zufahrt' && !!r.velo)) &&
  r.velo?.status !== 'nicht_erfuellt'
const alle = (v: VarianteRichtung[]) => v.every(x => x.reicht)
const zahlen = (v: VarianteRichtung[]) => v.map(x => x.nurVelo ? `${lageWort(x)} nur Velo ${f1(x.vorhanden)} m (erforderlich ${x.massgebend} m)` :
  `${lageWort(x)} ${f1(x.vorhanden)} m (erforderlich ${x.massgebend} m)` +
  (x.paareFrei !== undefined ? `, Abb. 5 ${x.paareFrei ? 'frei' : 'nicht frei'}` : '') +
  (x.velo ? `, Velo ${f1(x.velo.vorhanden)} m (erforderlich ${x.velo.massgebend} m)` : '')).join(', ')
const gross = (t: string) => t[0].toUpperCase() + t.slice(1)
const wort = (b: boolean) => (b ? 'reicht' : 'reicht nicht')

/** Massnahmen nach Ziffer 14; null, wenn keine Richtung «nicht erfüllt» ist */
export function massnahmenRechnen(m: MassnahmenEingang): Massnahme[] | null {
  const rs = m.richtungen.filter(mitVerkehr)
  const rv = m.rechtsvortritt ?? null
  if (!rs.some(nicht) && !rv?.aufheben) return null
  const out: Massnahme[] = []

  // 0 Rechtsvortritt aufheben (E3c, VSS 40 273 Ziffer 16)
  if (rv?.aufheben) out.push({ nr: 0, titel: 'Rechtsvortritt aufheben und Vortritt signalisieren', reicht: null, zeilen: [],
    text: 'Zustand nach Abb. 6 «zu sanieren» bzw. Sichtfeld nach Abb. 5 nicht frei: lassen sich Sichtweite und Wahrnehmbarkeit nicht ' +
      'mit verhältnismässigem Aufwand verbessern, ist der Rechtsvortritt aufzuheben und der Vortritt zu signalisieren (VSS 40 273 Ziffer 16); ' +
      'danach gilt Teil D (Vortrittsregelung im Panel umstellen und neu rechnen).' })
  // Wahrnehmbarkeit verbessern (E3c, Ziffern 17 und 18): Zustand je Stufe bei der heutigen Sichtweite (Nr. 9, als Zweites gezeigt)
  if (rv) out.push({ nr: 9, titel: 'Wahrnehmbarkeit verbessern', reicht: null, zeilen: rv.wahrnehmbarkeit.map(text => ({ text, reicht: null })),
    text: 'Je besser der Knoten wahrnehmbar ist, desto kleiner darf die Knotensichtweite sein (Ziffer 17): z. B. Hecken und Gärten an ' +
      'der Kreuzung unterbrechen, Gehwegführung an der Abzweigung, besondere Markierung, vertikaler Versatz (Ziffer 18). Zustand nach ' +
      'Abb. 6 bei der heutigen Sichtweite je Stufe:' })

  // 1 Hindernis entfernen (je Verdecker bis A, ohne Gebäude der AV und ohne «nur Hinweis»)
  const kandidaten = new Map<string, { name: string; art: string; quelle: string }>()
  for (const r of rs) for (const t of [...r.verdeckerListe, ...(r.velo?.verdeckerListe ?? [])])
    if (t.quelle !== 'AV' && t.wirkung !== 'hinweis' && !kandidaten.has(t.id)) kandidaten.set(t.id, { name: t.name, art: t.art, quelle: t.quelle })
  // Rechtsvortritt: auch die Flächen, die eine Sichtlinie der Paarmatrix (Abb. 5) verdecken
  for (const t of rv?.verdecker ?? []) if (t.quelle !== 'AV' && !kandidaten.has(t.id)) kandidaten.set(t.id, { name: t.name, art: t.art, quelle: t.quelle })
  const zeilen1: MassnahmeZeile[] = [...kandidaten].map(([id, k]) => {
    const v = m.variante({ ohne: [id] })
    // Name nennt die Art meist schon (z. B. «Parkfeld blau (APK), Nr. 1639 …»)
    const name = k.name.startsWith(k.art.split(' ')[0]) ? k.name : `${k.art}: ${k.name}`
    return { id, reicht: alle(v), text: `ohne ${name}, ${k.quelle}: ${zahlen(v)}; ${wort(alle(v))}` }
  })
  if (kandidaten.size > 1 && !zeilen1.some(z => z.reicht)) {
    const v = m.variante({ ohne: [...kandidaten.keys()] })
    zeilen1.push({ reicht: alle(v), text: `ohne alle ${kandidaten.size} zusammen: ${zahlen(v)}; ${wort(alle(v))}` })
  }
  out.push({ nr: 1, titel: 'Hindernis entfernen', reicht: kandidaten.size ? zeilen1.some(z => z.reicht) : null, zeilen: zeilen1,
    text: kandidaten.size ? 'Je Hindernis im Sichtdreieck (bis zur erforderlichen Sichtweite) die Rechnung ohne es (Parkfeld aufheben, Bepflanzung zurückschneiden, ' +
      'Einfriedung ersetzen); Gebäude der AV sind ausgenommen (nicht verhältnismässig), die Fahrstreifenachse bleibt.' :
      'Im Sichtdreieck (bis zur erforderlichen Sichtweite) verdecken nur Gebäude der AV (nicht verhältnismässig zu entfernen).' })

  // 2 Haltelinie vorverlegen
  let halteReicht: boolean | null = null
  const zeilen2: MassnahmeZeile[] = []
  let text2: string
  if (rv) text2 = 'Beim Rechtsvortritt nicht anwendbar (keine Haltelinie, B 5,00 m nach Abb. 4).'
  else if (!m.haltelinie) text2 = 'D von Hand gesetzt: nicht gerechnet.'
  else {
    const { dHeute, bezug, lage } = m.haltelinie
    halteReicht = false
    let letzte: VarianteRichtung[] | null = null, letzteB = dHeute
    // Schritte ab der heutigen Lage; liegt sie nicht auf dem Raster, zuletzt genau HALTELINIE_MIN_M
    const stufen: number[] = []
    for (let k = 1; ; k++) {
      const b = Math.round((dHeute - k * HALTELINIE_SCHRITT_M) * 100) / 100
      if (b < HALTELINIE_MIN_M - 1e-9) break
      stufen.push(b)
    }
    if (dHeute > HALTELINIE_MIN_M + 1e-9 && (!stufen.length || stufen[stufen.length - 1] > HALTELINIE_MIN_M + 1e-9)) stufen.push(HALTELINIE_MIN_M)
    for (const b of stufen) {
      const l = lage(b)
      const v = m.variante({ D: l.D })
      letzte = v; letzteB = b
      if (alle(v)) {
        const vor = Math.round((dHeute - b) * 100) / 100
        zeilen2.push({ reicht: true, uebernehmen: { art: 'haltelinie', p: l.haltelinie },
          text: `Haltelinie ${f2(vor)} m vorverlegt, D ${f2(b)} m hinter der ${bezug}: ${zahlen(v)}; reicht` })
        halteReicht = true
        break
      }
    }
    if (!halteReicht) zeilen2.push({ reicht: false, text: letzte ? `bis D ${f2(letzteB)} m hinter der ${bezug}: ${zahlen(letzte)}; reicht nicht` :
      `D steht schon ${f2(dHeute)} m hinter der ${bezug} (höchstens bis ${f2(HALTELINIE_MIN_M)} m): reicht nicht` })
    text2 = `Nur an bestehenden Knoten und Zufahrten, mit begleitenden Markierungen (Sperrfläche, Randlinie). D ab der heutigen Lage ` +
      `(${f2(dHeute)} m hinter der ${bezug}) in Schritten von ${f2(HALTELINIE_SCHRITT_M)} m näher an die ${bezug}, bis ` +
      `${f2(HALTELINIE_MIN_M)} m; «vorverlegt» zählt ab der heutigen Haltelinie bzw. dem heutigen Nullpunkt.`
  }
  out.push({ nr: 2, titel: 'Haltelinie vorverlegen', reicht: halteReicht, text: text2, zeilen: zeilen2 })

  // 3 «Stop»-Signal
  if (rv) out.push({ nr: 3, titel: '«Stop»-Signal', reicht: null, zeilen: [], text: 'Beim Rechtsvortritt: «Stop» bzw. «Kein Vortritt» ' +
    'an dieser Zufahrt heben den Rechtsvortritt auf (wie Nr. 0); danach gilt Teil D mit B nach Ziffer 12 (Vortrittsregelung im Panel ' +
    'umstellen).' })
  else if (m.regelung === 'stop') out.push({ nr: 3, titel: '«Stop»-Signal', reicht: null, zeilen: [], text: 'Die Zufahrt ist schon mit «Stop» gerechnet.' })
  else if (!m.ausserorts) out.push({ nr: 3, titel: '«Stop»-Signal', reicht: null, zeilen: [],
    text: 'Innerorts ändert «Stop» die Beobachtungsdistanz nicht (B 3,00 m, Ziffer 12): keine Wirkung auf die Rechnung.' })
  else if (!m.dStop) out.push({ nr: 3, titel: '«Stop»-Signal', reicht: null, zeilen: [], text: 'D von Hand gesetzt: nicht gerechnet.' })
  else {
    const v = m.variante({ D: m.dStop })
    out.push({ nr: 3, titel: '«Stop»-Signal', reicht: alle(v), text: 'Ausserorts mit «Stop»: B 3,00 statt 5,00 m (Ziffer 12).',
      zeilen: [{ reicht: alle(v), text: `mit «Stop»: ${zahlen(v)}; ${wort(alle(v))}`, uebernehmen: { art: 'stop' } }] })
  }

  // 4 Rechtsabbiegegebot
  const links = rs.find(r => r.richtung === 'links'), rechts = rs.find(r => r.richtung === 'rechts')
  const rab = !!links && ok(links) && !!rechts && !ok(rechts)
  // Zufahrt auf der durchgehenden Strasse (ein Arm gegenüber): das Gebot setzt eine einmündende Zufahrt voraus; mit dem
  // Gegenverkehr kreuzt nur, wer links abbiegt, also ist dort ein Linksabbiegeverbot die passende Massnahme (nur Vermerk)
  const gegen = rs.find(r => r.lage === 'gegenueber')
  out.push({ nr: 4, titel: 'Rechtsabbiegegebot', reicht: null, zeilen: [], text: rv ? 'Beim Rechtsvortritt nicht anwendbar.' : gegen ?
    `Nicht anwendbar: die Zufahrt liegt auf der durchgehenden Strasse (Gegenverkehr aus ${gegen.strasse}). Vermerk Linksabbiegeverbot: ` +
    `nur wer links abbiegt, kreuzt den Gegenverkehr; mit dem Verbot ist die Sicht zum Gegenverkehr nicht nötig${ok(gegen) ? ' (sie ist ' +
    'heute ausreichend)' : ' (heute nicht ausreichend)'}. Die Rechnung bleibt, nur Vermerk.` : rab ?
    `${gross(lageNach(links!))} erfüllt, ${lageNach(rechts!)} nicht: Rechtsabbiegegebot möglich (Ziffer 14); die Rechnung bleibt, nur Vermerk.` :
    `Nicht anwendbar: ${!links ? 'von links kein Verkehr' : !ok(links) ? `${lageNach(links)} nicht ausreichend` : 'von rechts kein Verkehr'}.` })

  // 5 Tempo senken (je Richtung, die nicht reicht)
  const zeilen5: MassnahmeZeile[] = []
  let tempoReicht = true
  for (const r of rv ? [] : rs.filter(nicht)) {
    let gefunden = false
    for (const t of TAB1_STUFEN.filter(x => x < r.stufe).reverse()) {
      const v = m.variante({ tempo: { [r.richtung]: t } }).find(x => x.richtung === r.richtung)!
      zeilen5.push({ reicht: v.reicht, text: `${lageNach(r)} bei ${t} km/h statt ${r.tempo}: ` + (v.nurVelo ? '' :
        `Sichtweite erforderlich ${v.massgebend} m, vorhanden ${f1(v.vorhanden)} m`) +
        `${v.velo ? `${v.nurVelo ? '' : ', '}Velo erforderlich ${v.velo.massgebend} m, vorhanden ${f1(v.velo.vorhanden)} m` : ''}; ` +
        wort(v.reicht), ...(v.reicht ? { uebernehmen: { art: 'tempo', richtung: r.richtung, wert: t } as Uebernahme } : {}) })
      if (v.reicht) { gefunden = true; break }
    }
    if (!gefunden) { tempoReicht = false; if (r.stufe <= TAB1_STUFEN[0]) zeilen5.push({ reicht: false, text: `${lageNach(r)}: schon die tiefste Stufe der Tab. 1` }) }
  }
  if (rv) out.push({ nr: 5, titel: 'Tempo senken', reicht: null, zeilen: [], text: 'Beim Rechtsvortritt gilt 30 km/h fest (Ziffer 15): ' +
    'keine Rechnung; die Wahrnehmbarkeit des Knotens verbessern (Ziffer 18, z. B. besondere Markierung, vertikaler Versatz) hebt den ' +
    'Zustand nach Abb. 6.' })
  else out.push({ nr: 5, titel: 'Tempo senken', reicht: tempoReicht, zeilen: zeilen5, text: 'Nächsttiefere Stufen der Tab. 1, mit der ' +
    'Anhaltesichtweite bei der Längsneigung. Senkung der Höchstgeschwindigkeit nur mit Gutachten nach SSV; auf ' +
    'siedlungsorientierten Strassen auch Gestaltung nach VSS 40 213 (z. B. Aufpflästerung).' })

  // 6 Lichtsignalanlage
  out.push({ nr: 6, titel: 'Lichtsignalanlage im Dauerbetrieb', reicht: null, zeilen: [], text: 'Vermerk ohne Rechnung (Ziffer 14).' })

  // 7 Spiegel: nur wenn die Haltelinie bis 1,50 m nicht reicht
  if (halteReicht !== true && !rv) out.push({ nr: 7, titel: 'Spiegel (Notbehelf)', reicht: null, zeilen: [], bedingungen: SPIEGEL_BEDINGUNGEN,
    sichtUnterMin: halteReicht === false,
    text: halteReicht === false ? `Direkte Sicht erst bei D unter ${f2(HALTELINIE_MIN_M)} m hinter der Kante: Spiegel nur als Notbehelf, ` +
      'wenn alle Bedingungen erfüllt sind (abhaken; die App bewertet sie nicht).' :
      'D von Hand: Bedingung «direkte Sicht erst unter 1,50 m» nicht geprüft. Spiegel nur als Notbehelf, wenn alle Bedingungen erfüllt sind.' })

  // 8 Aufhebung der Ausfahrt
  if (m.grundstueck) out.push({ nr: 8, titel: 'Aufhebung der Ausfahrt', reicht: null, zeilen: [],
    text: 'Grundstückzufahrt: Aufhebung der gefährlichen Ausfahrt als letzte Massnahme (Ziffer 14).' })
  return out
}
