// ── Bedarfsmodul: Grundfall S0 und Testfälle je Regel (E0) ──
//
// Daten für regeln.test.ts und katalog.test.ts (Abdeckung: jede Regel mit Befund kommt in mindestens einem Fall vor), nach
// Bedarfsmodul_E0_Regeln.md Abschnitt 3. Jeder Fall weicht nur in den genannten Feldern vom Grundfall S0 ab; null = Feld offen.
// Erwartet: Stärke des Eintrags, «offen» oder «-» (kein Eintrag dieser Regel). Geprüft wird über den ganzen Baum (beurteile).

import { eingabenAus, FELDNAMEN, type BedarfEingaben, type FeldName, type Insel, type LsaZeiten, type Q3, type Werte } from './eingaben'
import type { Optionen } from './entscheid'
import type { EmpfTyp, Staerke } from './typen'
import { KATALOG } from './katalog'

export const INSEL_KEINE: Insel = { vorhanden: false, art: null, breite: null, kopfUeberstand: null, vertikal: null, kopfErhoeht: null, pfostenH: null, furt: null }
/** bauliche Insel, die alle Inselregeln erfüllt (Mittelinsel Standard E1) */
export const INSEL_OK: Insel = { vorhanden: true, art: 'baulich', breite: 2, kopfUeberstand: [1, 1], vertikal: true, kopfErhoeht: true, pfostenH: 0.8, furt: 1.2 }
export const LSA_OK: LsaZeiten = {
  L: 7, teile: null, inselB: null, gelb: 4, freigabe: 6, phasengleich: true, beideRichtungenImZyklus: true, wartezeit: 20,
  vorstart: 2, abbiegerKonflikt: false, inselGeraet: true, inselNurAnmeldung: false,
}
export const Q3_OK: Q3 = {
  bebaut: true, gewerbe: false, anschlussGewerbe: false, ueber: 'einmuendend', vSigHaupt: 50, vSigEinm: 30, nEinm: 1, nHaupt: 1,
  trottoirBeidseits: true, winkel: 90, knotensichtOk: true, hvl5m: true, gegenueberEinm: false, belastungSchwach: true,
  veloSchule: false, einmSiedlungsorientiert: true, zoneEinm: 'keine', eingangstor: false, hauptInZone: false, wartezeitEinmS: 20,
  lkwGelegentlich: true, linienbus: false, lsaKnoten: false, kreisel: false, breiteM: 3, anrampung: null, dtvEinm: 3000,
  mivEinmHoch: false, randDurchgehend: true, ueberfahrbarM: 12, begrenzung: 'poller', erkennbar: true, belag: 'gleich', quergefaelle: 2,
  randabschluss: 's0625', randsteineSenkrecht: true, signalisation: false, markierung: false, taktil: true,
}

/** Grundfall S0 (Abschnitt 3): FGS innerorts, Tempo 50, DTV 8000, 7,00 m, ein Fahrstreifen je Richtung, keine Insel */
export const S0: Werte = {
  innerorts: true, vSig: 50, tempoRegime: 'strecke', v85: 48, v85Nachweis: true,
  anzeichenSchneller: false, dtv: 8000, fg5h: 250, fgKlasse: '100-500', fgQuelle: 'zaehlung', fgSehrHoch: false,
  netz: 'basisnetz', netzQualifiziert: false, beduerfnis: [], strassentyp: 'verkehrsorientiert', starkBelastet: false,
  nachfrage: 'punktuell', wunschlinieM: 0, lage: 'strecke', knotenArmeOhneQuerung: 0, knotenLsa: false, fahrbahnB: 7,
  zweirichtung: true, nRichtung: [1, 1], radstreifen: false, busspur: false, busDurchmarkiert: false,
  alleZufahrtsstreifenBelastet: false, tram: 'keins', tramHaltestellenbereich: false, balkenAufGleis: false, insel: INSEL_KEINE,
  inselMoeglich: true, durchfahrt: [3.6, 3.6], haltestelle: { art: null, lage: null, verdeckt: null, ueberholenUnterbunden: null },
  abstandFgsM: 120, abstandLsaM: 300, verzweigung: false, verzweigungErkennbar: false, haltestelleAngrenzend: false,
  fgsMitLsa: false, neuanlage: false, rueckversatzM: 0, signal411: true, signal411Insel: false, beleuchtung: true,
  schattenfrei: true, hvl: { vorhanden: false, laengeM: null, beidseits: null }, hvlBedarfM: 0, haltenSichtrelevantUeber5m: false,
  haltenSonstVerboten: false, reklameUnter20m: false, reklameAusnahme: false, annaeherungUeberfahrbar: false,
  einAusfahrtNah: false, blinklicht: 'keins', fusswegAchse: { rechtwinkligUneinsehbar: false, versatz: false, umlaufschranke: false },
  streifenBreite: 4, randAbstand: [0.3, 0.3], achsWinkel: 90, randabschluss: { art: 'vertikal', hoeheMm: 30, breiteM: null },
  quergefaelle: 2, absenkung: 5, taktil: false, leitlinie: false, querungLang: false, sichtVorh: [70, 70], erkennungM: 120,
  kurve: { radius: null, fuenfBedingungen: false }, typ: 'fgs', ohneBaulich: false, querdistanzL: [7], laengsparkierung: false,
  seitenraumVorParklinieM: 0, absenkungBeidseits: true, aufstellflaeche: true, parkierungSichtbehindernd: false, einengung: false,
  mivKlasse: 'mittel', restbreiteM: 7, einengungLaengeM: 0, mzsBreiteM: 2, mzsMitFgs: false, lsaZeiten: LSA_OK, q3: Q3_OK,
  kantonsstrasse: false, veloQuerung: false,
}

/** Abweichung vom Grundfall; null = Feld offen */
export type Abw = { [K in FeldName]?: Werte[K] | null }

/** Eingaben: S0 mit Abweichungen (Quelle Hand) */
export function fall(abw: Abw = {}): BedarfEingaben {
  const w: Partial<Werte> = {}
  for (const k of FELDNAMEN) {
    const v = k in abw ? abw[k] : S0[k]
    if (v !== null && v !== undefined) (w as Record<string, unknown>)[k] = v
  }
  return eingabenAus(w)
}

export type Erw = Staerke | 'offen' | '-'
export interface Testfall {
  regel: string
  name: string
  abw: Abw
  ebenen?: Optionen['ebenen']
  erwartet: Record<string, Erw>
  /** Soll-Text eines Eintrags enthält … */
  soll?: Record<string, string>
  /** Ist-Text eines Eintrags enthält … */
  ist?: Record<string, string>
  empfehlung?: EmpfTyp
}

const BERN = { bern: true } as const
const KANTON = { kantonBE: true } as const
const ins = (x: Partial<Insel>): Insel => ({ ...INSEL_OK, ...x })
const q3 = (x: Partial<Q3>): Q3 => ({ ...Q3_OK, ...x })
const lsa = (x: Partial<LsaZeiten>): LsaZeiten => ({ ...LSA_OK, ...x })
const EINM = { lage: 'einmuendung' } as const
/** beurteilte Trottoirüberfahrt an der Einmündung (Q3-Befunde nur dann, Korrektur M2) */
const TUE = { lage: 'einmuendung', typ: 'trottoirueberfahrt' } as const
const HALT_FB = { art: 'fahrbahn', lage: 'fgs_nach_halt', verdeckt: false, ueberholenUnterbunden: true } as const

export const TESTFAELLE: Testfall[] = [
  // ── A ──
  { regel: 'A1', name: 'ausserorts', abw: { innerorts: false }, erwartet: { A1: 'hinweis', A2: '-', C1: '-' } },
  { regel: 'A2', name: 'Begegnungszone', abw: { tempoRegime: 'begegnungszone', vSig: 20 }, erwartet: { A2: 'hart', C1: '-', D2c: '-' }, empfehlung: 'flaechig' },
  { regel: 'A3', name: 'V85 51', abw: { v85: 51 }, erwartet: { A3: 'weich' } },
  { regel: 'A3', name: 'V85 50', abw: { v85: 50 }, erwartet: { A3: '-' } },
  { regel: 'A4', name: 'V85 fehlt, Anzeichen', abw: { v85: null, anzeichenSchneller: true }, erwartet: { A4: 'hinweis', H1: 'offen' } },
  { regel: 'A4', name: 'V85 fehlt, Anzeichen, Sicht schon nach vSig zu kurz', abw: { v85: null, anzeichenSchneller: true, sichtVorh: [50, 70] },
    erwartet: { A4: 'hinweis', H1: 'hart' } },
  // ── B ──
  { regel: 'B1', name: 'flächig', abw: { nachfrage: 'flaechig' }, erwartet: { B1: 'hart', C1: '-', D2c: '-' }, empfehlung: 'flaechig' },
  { regel: 'B3', name: 'Einmündung', abw: EINM, erwartet: { B3: 'hinweis', 'Q3-1': '-' } },
  { regel: 'B4', name: 'Knoten mit Arm ohne Querung', abw: { lage: 'knoten_berechtigt', knotenArmeOhneQuerung: 1 }, erwartet: { B4: 'weich' } },
  // ── C ──
  { regel: 'C1', name: 'vSig 60, V85 60', abw: { vSig: 60, v85: 60 }, erwartet: { C1: '-' } },
  { regel: 'C1', name: 'vSig 60, V85 61', abw: { vSig: 60, v85: 61 }, erwartet: { C1: 'hart' }, empfehlung: 'furt' },
  { regel: 'C1', name: 'vSig 50, V85 61', abw: { vSig: 50, v85: 61 }, erwartet: { C1: 'hart', A3: 'weich' } },
  { regel: 'C1', name: 'vSig 70, ohne V85', abw: { vSig: 70, v85: null }, erwartet: { C1: 'hart' } },
  { regel: 'C2', name: 'T30-Zone ohne Bedürfnis', abw: { tempoRegime: 't30_zone', vSig: 30 }, erwartet: { C2: 'hart', E1: 'hinweis', D2c: '-' } },
  { regel: 'C2b', name: 'T30-Zone mit Schule', abw: { tempoRegime: 't30_zone', vSig: 30, beduerfnis: ['schule'] }, erwartet: { C2b: 'hinweis', C2: '-' }, empfehlung: 'Q1' },
  // C2c gestrichen (Nutzerentscheid 20.10.2026): Hauptstrasse mit Tempo 30 ausserhalb der Zone ist eine Strecke
  { regel: 'C2', name: 'Tempo 30 auf einer Hauptstrasse ausserhalb der Zone (Strecke)', abw: { tempoRegime: 'strecke', vSig: 30 }, erwartet: { C2: '-', C2b: '-' }, empfehlung: 'Q1' },
  { regel: 'C2-B', name: 'T30-Zone Basisnetz, Bern', abw: { tempoRegime: 't30_zone', vSig: 30 }, ebenen: BERN, erwartet: { C2: 'hart', 'C2-B': 'hinweis' } },
  { regel: 'C3', name: 'FG 99, kein Netz', abw: { fg5h: 99, netz: 'keins' }, erwartet: { C3: 'weich' } },
  { regel: 'C3', name: 'FG 100', abw: { fg5h: 100, netz: 'keins' }, erwartet: { C3: '-' } },
  { regel: 'C3b', name: 'FG 60, qualifizierte Netzplanung', abw: { fg5h: 60, netzQualifiziert: true }, erwartet: { C3b: 'hinweis', C3: '-' } },
  { regel: 'C3c', name: 'Schätzklasse <100', abw: { fg5h: null, fgKlasse: '<100', fgQuelle: 'schaetzung', netz: 'keins' }, erwartet: { C3: 'weich', C3c: 'hinweis' } },
  { regel: 'C4', name: 'DTV 2999', abw: { dtv: 2999 }, erwartet: { C4: 'weich' } },
  { regel: 'C4', name: 'DTV 3000', abw: { dtv: 3000 }, erwartet: { C4: '-' } },
  { regel: 'C4-B', name: 'DTV 2500 Basisnetz, Bern', abw: { dtv: 2500 }, ebenen: BERN, erwartet: { C4: 'weich', 'C4-B': 'hinweis' } },
  // ── D ──
  { regel: 'D1', name: 'n [2,1]', abw: { nRichtung: [2, 1] }, erwartet: { D1: 'hart_bericht', 'D5-3': 'hinweis', D2c: '-' }, empfehlung: 'Q1' },
  { regel: 'D1', name: 'n [2,1] mit baulicher Insel', abw: { nRichtung: [2, 1], insel: INSEL_OK }, erwartet: { D1: '-' } },
  { regel: 'D1', name: 'Ausnahme vortrittsbelastete Zufahrt', abw: { nRichtung: [2, 1], lage: 'knoten_belastet', alleZufahrtsstreifenBelastet: true }, erwartet: { D1: '-' } },
  { regel: 'D1', name: 'n [2,1] mit markierter Insel', abw: { nRichtung: [2, 1], insel: ins({ art: 'markiert' }) }, erwartet: { D1: 'hart_bericht', F2d: 'hart' } },
  { regel: 'D1b', name: 'n [2,2], keine Insel möglich', abw: { nRichtung: [2, 2], inselMoeglich: false }, erwartet: { D1: 'hart_bericht', D1b: 'hinweis' }, empfehlung: 'Q2' },
  { regel: 'D2', name: 'B 8,50, DTV 3000', abw: { fahrbahnB: 8.5, dtv: 3000 }, erwartet: { D2: 'hart_bericht' }, empfehlung: 'Q1' },
  { regel: 'D2', name: 'B 8,49', abw: { fahrbahnB: 8.49 }, erwartet: { D2: '-', D2a: '-', D2c: KATALOG.D2c.staerke } },
  { regel: 'D2a', name: 'B 9,00, DTV 2999', abw: { fahrbahnB: 9, dtv: 2999 }, erwartet: { D2: '-', D2a: 'hinweis', D2c: '-' } },
  { regel: 'D2', name: 'Einbahn B 9,00', abw: { fahrbahnB: 9, zweirichtung: false, nRichtung: [1] }, erwartet: { D2: '-' } },
  { regel: 'D2', name: 'B 9,00, DTV fehlt', abw: { fahrbahnB: 9, dtv: null }, erwartet: { D2: 'offen', C4: 'offen' } },
  { regel: 'D2c', name: 'S0', abw: {}, erwartet: { D2c: KATALOG.D2c.staerke } },
  { regel: 'D3a', name: 'Eigentrassee ohne Insel', abw: { tram: 'eigentrassee' }, erwartet: { D3a: 'hart_bericht', D2c: '-' } },
  { regel: 'D3a', name: 'Eigentrassee mit LSA', abw: { tram: 'eigentrassee', fgsMitLsa: true }, erwartet: { D3a: '-' } },
  { regel: 'D3b', name: 'Balken auf dem Gleis', abw: { tram: 'eigentrassee', balkenAufGleis: true }, erwartet: { D3b: 'weich' } },
  { regel: 'D5-5', name: 'Tram auf der Fahrbahn ausserhalb Haltestelle', abw: { tram: 'fahrbahn' }, erwartet: { D3c: '-', 'D5-5': 'hinweis' } },
  { regel: 'D4a', name: 'im Haltestellenbereich', abw: { haltestelle: { ...HALT_FB, lage: 'im_bereich' } }, erwartet: { D4a: 'hart' } },
  { regel: 'D4b', name: 'Bus verdeckt, keine Insel', abw: { haltestelle: { ...HALT_FB, verdeckt: true } }, erwartet: { D4b: 'hart' } },
  { regel: 'D4b', name: 'Bus verdeckt, mit Insel', abw: { haltestelle: { ...HALT_FB, verdeckt: true }, insel: INSEL_OK }, erwartet: { D4b: '-' } },
  { regel: 'D4c', name: 'FGS vor dem Halt', abw: { haltestelle: { ...HALT_FB, art: 'bucht', lage: 'fgs_vor_halt' } }, erwartet: { D4c: 'weich' } },
  { regel: 'D4d', name: 'Überholen nicht unterbunden', abw: { haltestelle: { ...HALT_FB, ueberholenUnterbunden: false } }, erwartet: { D4d: 'weich' } },
  { regel: 'D4-R', name: 'bfu-Abstand B 6,00', abw: { haltestelle: HALT_FB, fahrbahnB: 6 }, erwartet: { 'D4-R': 'hinweis' }, soll: { 'D4-R': '24 m' } },
  { regel: 'D4-R', name: 'bfu-Abstand aus (Richtlinie aus)', abw: { haltestelle: HALT_FB, fahrbahnB: 6 }, ebenen: { richtlinie: false }, erwartet: { 'D4-R': '-' } },
  { regel: 'D5-1', name: 'stark belastet', abw: { starkBelastet: true }, erwartet: { 'D5-1': 'hinweis' } },
  { regel: 'D5-2', name: 'LSA-Knoten', abw: { lage: 'knoten_berechtigt', knotenLsa: true }, erwartet: { 'D5-2': 'hinweis' } },
  { regel: 'D5-3', name: 'n [2,1] ohne Insel', abw: { nRichtung: [2, 1] }, erwartet: { 'D5-3': 'hinweis', D1: 'hart_bericht' } },
  { regel: 'D5-3', name: 'n [2,1] mit bestehender LSA', abw: { nRichtung: [2, 1], typ: 'lsa' }, erwartet: { 'D5-3': '-', D1: '-' } },
  { regel: 'D5-2', name: 'LSA-Knoten mit bestehender LSA', abw: { lage: 'knoten_berechtigt', knotenLsa: true, fgsMitLsa: true }, erwartet: { 'D5-2': '-' } },
  { regel: 'D5-4', name: 'Sicht 50 (Soll 55)', abw: { sichtVorh: [50, 70] }, erwartet: { H1: 'hart', 'D5-4': 'hinweis' } },
  { regel: 'D5-6', name: 'sehr viele Querende', abw: { fgSehrHoch: true }, erwartet: { 'D5-6': 'hinweis' } },
  // Korrektur 23.10.2026: mit bestehendem Lichtsignal keine Hinweise «Lichtsignal prüfen»
  { regel: 'D5-1', name: 'stark belastet mit bestehender LSA', abw: { starkBelastet: true, fgsMitLsa: true }, erwartet: { 'D5-1': '-' } },
  { regel: 'D5-4', name: 'Sicht 50 mit bestehender LSA', abw: { sichtVorh: [50, 70], fgsMitLsa: true }, erwartet: { H1: 'hart', 'D5-4': '-' } },
  { regel: 'D5-5', name: 'Tram auf der Fahrbahn mit bestehender LSA', abw: { tram: 'fahrbahn', fgsMitLsa: true }, erwartet: { 'D5-5': '-' } },
  { regel: 'D5-6', name: 'sehr viele Querende mit bestehender LSA', abw: { fgSehrHoch: true, typ: 'lsa' }, erwartet: { 'D5-6': '-' } },
  { regel: 'D5-6', name: 'sehr viele Querende, Lichtsignal offen', abw: { fgSehrHoch: true, fgsMitLsa: null }, erwartet: { 'D5-6': 'offen' } },
  { regel: 'D6-1', name: 'Tempo 20 Strecke, Bern', abw: { vSig: 20, v85: null }, ebenen: BERN, erwartet: { 'D6-1': 'weich' } },
  { regel: 'D6-2', name: 'Tempo 50, DTV 12000, Bern', abw: { dtv: 12000 }, ebenen: BERN, erwartet: { 'D6-2': 'weich', 'D6-3b': 'hinweis' } },
  { regel: 'D6-2b', name: 'Tempo 50, DTV 5000, Bern', abw: { dtv: 5000 }, ebenen: BERN, erwartet: { 'D6-2b': 'hinweis', 'D6-2': '-' } },
  { regel: 'D6-2b', name: 'Tempo 30, DTV 5001, Bern', abw: { vSig: 30, v85: null, dtv: 5001 }, ebenen: BERN, erwartet: { 'D6-2b': 'hinweis' } },
  { regel: 'D6-2', name: 'Grenze Tempo 30, DTV 5000, Bern', abw: { vSig: 30, v85: null, dtv: 5000 }, ebenen: BERN, erwartet: { 'D6-2': '-', 'D6-2b': '-' } },
  { regel: 'D6-3', name: 'DTV 15001, Bern', abw: { dtv: 15001 }, ebenen: BERN, erwartet: { 'D6-3': 'weich', 'D6-3b': '-' } },
  { regel: 'D6-3b', name: 'DTV 15000, Bern', abw: { dtv: 15000 }, ebenen: BERN, erwartet: { 'D6-3b': 'hinweis', 'D6-3': '-' } },
  { regel: 'D6-4', name: 'n [2,1], Bern', abw: { nRichtung: [2, 1] }, ebenen: BERN, erwartet: { D1: 'hart_bericht', 'D6-4': 'weich' } },
  { regel: 'D6-5', name: 'neue LSA über 3 Fahrstreifen', abw: { typ: 'lsa', neuanlage: true, nRichtung: [2, 1] }, ebenen: BERN, erwartet: { 'D6-5': 'weich' } },
  { regel: 'D6-5', name: 'neue LSA über 8,60 m', abw: { typ: 'lsa', neuanlage: true, fahrbahnB: 8.6 }, ebenen: BERN, erwartet: { 'D6-5': 'weich' } },
  { regel: 'D7', name: 'FGS über Mehrzweckstreifen ohne Insel', abw: { typ: 'mehrzweck', mzsMitFgs: true }, erwartet: { D7: 'weich' } },
  // ── E ──
  { regel: 'E1', name: 'C1 verletzt, verkehrsorientiert', abw: { vSig: 60, v85: 65 }, erwartet: { C1: 'hart', E1: 'hinweis', 'D5-4': 'hinweis', E3: 'hart' }, empfehlung: 'furt' },
  { regel: 'E1b', name: 'wie E1, stark belastet', abw: { vSig: 60, v85: 65, starkBelastet: true }, erwartet: { E1b: 'hinweis' } },
  { regel: 'E2', name: 'T30-Zone ohne Bedürfnis, siedlungsorientiert', abw: { tempoRegime: 't30_zone', vSig: 30, strassentyp: 'siedlungsorientiert' },
    erwartet: { C2: 'hart', E2: 'hinweis' }, empfehlung: 'ohne_vortritt' },
  { regel: 'E1c', name: 'Furt ohne Insel (Runde 5)', abw: { typ: 'furt', strassentyp: 'verkehrsorientiert', insel: INSEL_KEINE }, erwartet: { E1c: 'hinweis' } },
  { regel: 'E2a', name: 'Furt auf siedlungsorientierter Strasse', abw: { typ: 'furt', strassentyp: 'siedlungsorientiert' }, erwartet: { E2a: 'hart' } },
  { regel: 'E2b', name: 'Längsparkierung ohne Seitenraum', abw: { laengsparkierung: true, seitenraumVorParklinieM: -2 }, erwartet: { E2b: 'hart' } },
  { regel: 'E2b', name: 'Längsparkierung, Seitenraum fehlt', abw: { laengsparkierung: true, seitenraumVorParklinieM: null }, erwartet: { E2b: 'offen' } },
  { regel: 'E2c', name: 'Seitenraum 0,10', abw: { laengsparkierung: true, seitenraumVorParklinieM: 0.1 }, erwartet: { E2c: 'weich', E2b: '-' } },
  { regel: 'E2c', name: 'Seitenraum 0,20', abw: { laengsparkierung: true, seitenraumVorParklinieM: 0.2 }, erwartet: { E2c: '-' } },
  { regel: 'E2d', name: 'ohne Massnahme, keine Absenkung', abw: { typ: 'ohne_vortritt', ohneBaulich: true, absenkungBeidseits: false }, erwartet: { E2d: 'hart' } },
  { regel: 'E2e', name: 'ohne Massnahme, DTV 4000', abw: { typ: 'ohne_vortritt', ohneBaulich: true, dtv: 4000 }, erwartet: { E2e: 'weich', E2d: '-' } },
  { regel: 'E3', name: 'Furt V85 50, L 7, Sicht 80 (über AHS, unter Formel)', abw: { typ: 'furt', v85: 50, querdistanzL: [7], sichtVorh: [80] }, erwartet: { E3: 'weich' }, soll: { E3: '81,0' } },
  { regel: 'E3', name: 'Furt V85 50, L 7, Sicht 54 (unter AHS)', abw: { typ: 'furt', v85: 50, querdistanzL: [7], sichtVorh: [54] }, erwartet: { E3: 'hart' } },
  { regel: 'E3', name: 'Furt V85 50, L 7, Sicht 82', abw: { typ: 'furt', v85: 50, querdistanzL: [7], sichtVorh: [82] }, erwartet: { E3: '-' } },
  { regel: 'E3', name: 'Teilquerung L 3,50, Sicht 50', abw: { typ: 'furt', v85: 50, querdistanzL: [3.5], sichtVorh: [50] }, erwartet: { E3: 'hart' }, soll: { E3: '55,0' } },
  { regel: 'E3', name: 'V85 30, L 6, Sicht 40', abw: { typ: 'furt', vSig: 30, v85: 30, querdistanzL: [6], sichtVorh: [40] }, erwartet: { E3: 'weich' }, soll: { E3: '41,7' } },
  { regel: 'E3', name: 'V85 30, L 3, Sicht 24', abw: { typ: 'furt', vSig: 30, v85: 30, querdistanzL: [3], sichtVorh: [24] }, erwartet: { E3: 'hart' }, soll: { E3: '25,0' } },
  { regel: 'E3', name: 'V85 30, L 3, Sicht 25', abw: { typ: 'furt', vSig: 30, v85: 30, querdistanzL: [3], sichtVorh: [25] }, erwartet: { E3: '-' } },
  { regel: 'E3', name: 'ohne V85: vSig als Annahme', abw: { typ: 'furt', v85: null, querdistanzL: [7], sichtVorh: [80] }, erwartet: { E3: 'weich' }, soll: { E3: '81,0' } },
  { regel: 'E3', name: 'markierte Insel, B 8,00: ganze Fahrbahn', abw: { typ: 'furt', v85: 50, fahrbahnB: 8, insel: ins({ art: 'markiert' }), querdistanzL: [3.5, 3], sichtVorh: [90, 90] },
    erwartet: { E3: 'weich', F2d: 'weich' }, soll: { E3: '92,6' } },
  { regel: 'E3a', name: 'Ausnahme FG 80, DTV 2500, Sicht 60', abw: { typ: 'furt', v85: 50, querdistanzL: [7], fg5h: 80, dtv: 2500, sichtVorh: [60] },
    erwartet: { E3: '-', E3a: 'weich' } },
  // ── Q3 ──
  { regel: 'Q3-1', name: 'nicht bebaut', abw: { ...TUE, q3: q3({ bebaut: false }) }, erwartet: { 'Q3-1': 'hart' } },
  { regel: 'Q3-2', name: 'Gewerbegebiet', abw: { ...TUE, q3: q3({ gewerbe: true }) }, erwartet: { 'Q3-2': 'hart' } },
  { regel: 'Q3-3', name: 'Anschluss Gewerbe', abw: { ...TUE, q3: q3({ anschlussGewerbe: true }) }, erwartet: { 'Q3-3': 'hart' } },
  { regel: 'Q3-4', name: 'Trottoirüberfahrt auf der Strecke', abw: { typ: 'trottoirueberfahrt' }, erwartet: { 'Q3-4': 'hart' } },
  // 27.10.2026: an einer Kreuzung über die Zufahrt ohne Vortritt zulässig (gegenüberliegende Einmündung), über die Strasse mit Vortritt nicht
  { regel: 'Q3-4', name: 'Kreuzung, über die Zufahrt ohne Vortritt', abw: { typ: 'trottoirueberfahrt', lage: 'knoten_belastet' }, erwartet: { 'Q3-4': '-' } },
  { regel: 'Q3-4', name: 'Kreuzung, über die Strasse mit Vortritt', abw: { typ: 'trottoirueberfahrt', lage: 'knoten_berechtigt' }, erwartet: { 'Q3-4': 'hart' } },
  { regel: 'Q3-5', name: 'über die Hauptfahrbahn', abw: { ...TUE, q3: q3({ ueber: 'haupt' }) }, erwartet: { 'Q3-5': 'hart' } },
  { regel: 'Q3-6', name: 'Hauptfahrbahn 60', abw: { ...TUE, q3: q3({ vSigHaupt: 60 }) }, erwartet: { 'Q3-6': 'hart' } },
  { regel: 'Q3-7', name: 'einmündend 2 Streifen', abw: { ...TUE, q3: q3({ nEinm: 2 }) }, erwartet: { 'Q3-7': 'hart' } },
  { regel: 'Q3-8', name: 'Hauptfahrbahn 2 Streifen', abw: { ...TUE, q3: q3({ nHaupt: 2 }) }, erwartet: { 'Q3-8': 'weich' } },
  { regel: 'Q3-9', name: 'Trottoir fehlt', abw: { ...TUE, q3: q3({ trottoirBeidseits: false }) }, erwartet: { 'Q3-9': 'hart' } },
  { regel: 'Q3-10', name: 'Winkel 40', abw: { ...TUE, q3: q3({ winkel: 40 }) }, erwartet: { 'Q3-10': 'hart' } },
  { regel: 'Q3-10', name: 'Winkel 136', abw: { ...TUE, q3: q3({ winkel: 136 }) }, erwartet: { 'Q3-10': 'hart' } },
  { regel: 'Q3-10', name: 'Winkel 45', abw: { ...TUE, q3: q3({ winkel: 45 }) }, erwartet: { 'Q3-10': '-' } },
  { regel: 'Q3-10', name: 'Winkel 135', abw: { ...TUE, q3: q3({ winkel: 135 }) }, erwartet: { 'Q3-10': '-' } },
  { regel: 'Q3-11', name: 'Knotensicht fehlt', abw: { ...TUE, q3: q3({ knotensichtOk: false }) }, erwartet: { 'Q3-11': 'hart' } },
  { regel: 'Q3-12', name: 'Halteverbot fehlt', abw: { ...TUE, q3: q3({ hvl5m: false }) }, erwartet: { 'Q3-12': 'hart' } },
  { regel: 'Q3-M1', name: 'einmündend verkehrsorientiert', abw: { ...TUE, q3: q3({ einmSiedlungsorientiert: false }) }, erwartet: { 'Q3-M1': 'weich' } },
  { regel: 'Q3-M2', name: 'Zone ohne Eingangstor', abw: { ...TUE, q3: q3({ zoneEinm: 't30' }) }, erwartet: { 'Q3-M2': 'hart' } },
  { regel: 'Q3-M2', name: 'Hauptverkehrsstrasse in der Zone', abw: { ...TUE, q3: q3({ zoneEinm: 't30', hauptInZone: true }) }, erwartet: { 'Q3-M2': '-' } },
  { regel: 'Q3-M2', name: 'Zone mit Eingangstor', abw: { ...TUE, q3: q3({ zoneEinm: 't30', eingangstor: true }) }, erwartet: { 'Q3-M2': '-' } },
  { regel: 'Q3-M3', name: 'Wartezeit 26 s', abw: { ...TUE, q3: q3({ wartezeitEinmS: 26 }) }, erwartet: { 'Q3-M3': 'weich' } },
  { regel: 'Q3-M3', name: 'Wartezeit 25 s', abw: { ...TUE, q3: q3({ wartezeitEinmS: 25 }) }, erwartet: { 'Q3-M3': '-' } },
  { regel: 'Q3-M4', name: 'viele Lastwagen', abw: { ...TUE, q3: q3({ lkwGelegentlich: false }) }, erwartet: { 'Q3-M4': 'weich' } },
  { regel: 'Q3-M5', name: 'Linienbus', abw: { ...TUE, q3: q3({ linienbus: true }) }, erwartet: { 'Q3-M5': 'weich' } },
  { regel: 'Q3-M6', name: 'Veloroute', abw: { ...TUE, q3: q3({ veloSchule: true }) }, erwartet: { 'Q3-M6': 'weich' } },
  { regel: 'Q3-M7', name: 'LSA-Knoten', abw: { ...TUE, q3: q3({ lsaKnoten: true }) }, erwartet: { 'Q3-M7': 'hart' } },
  { regel: 'Q3-M8', name: 'Kreisel', abw: { ...TUE, q3: q3({ kreisel: true }) }, erwartet: { 'Q3-M8': 'hart' } },
  { regel: 'Q3-M9', name: 'gegenüberliegende Einmündung', abw: { ...TUE, q3: q3({ gegenueberEinm: true, belastungSchwach: false }) }, erwartet: { 'Q3-M9': 'weich' } },
  { regel: 'Q3-M10', name: 'viele Querende, viel Verkehr', abw: { ...TUE, fg5h: 600, q3: q3({ mivEinmHoch: true }) }, erwartet: { 'Q3-M10': 'hinweis' } },
  { regel: 'Q3-B', name: 'Bern Tempo 30, DTV 4799', abw: { ...TUE, q3: q3({ dtvEinm: 4799 }) }, ebenen: BERN, erwartet: { 'Q3-B': 'hinweis' }, ist: { 'Q3-B': 'Ja' } },
  { regel: 'Q3-B', name: 'Bern Tempo 30, DTV 4800', abw: { ...TUE, q3: q3({ dtvEinm: 4800 }) }, ebenen: BERN, erwartet: { 'Q3-B': 'hinweis' }, ist: { 'Q3-B': 'Nein' } },
  { regel: 'Q3', name: 'Einmündung mit FGS: Q3 nur als Option, keine Befunde', abw: { ...EINM, q3: q3({ nEinm: 2 }) }, erwartet: { 'Q3-7': '-', B3: 'hinweis' } },
  { regel: 'Q3', name: 'Einmündung ohne Q3-Eingaben: nicht ausgewertet', abw: { ...EINM, q3: null }, erwartet: { 'Q3-2': '-', 'Q3-4': '-' } },
  // ── F ──
  { regel: 'F1a', name: 'Streifen 2,99', abw: { streifenBreite: 2.99 }, erwartet: { F1a: 'hart', F1b: '-' } },
  { regel: 'F1b', name: 'Streifen 3,00', abw: { streifenBreite: 3 }, erwartet: { F1b: 'weich', F1a: '-' } },
  { regel: 'F1b', name: 'Streifen 3,99', abw: { streifenBreite: 3.99 }, erwartet: { F1b: 'weich' } },
  { regel: 'F1b', name: 'Streifen 4,00', abw: { streifenBreite: 4 }, erwartet: { F1b: '-' } },
  { regel: 'F1-K', name: 'Kantonsstrasse 3,00', abw: { kantonsstrasse: true, streifenBreite: 3 }, ebenen: KANTON, erwartet: { 'F1-K': 'hinweis', F1b: 'weich' } },
  { regel: 'F1-K', name: 'Kantonsstrasse 3,00, Kanton aus', abw: { kantonsstrasse: true, streifenBreite: 3 }, erwartet: { 'F1-K': '-', F1b: 'weich' } },
  { regel: 'F1c', name: 'Randabstand 0,51', abw: { randAbstand: [0.51, 0.3] }, erwartet: { F1c: 'hart' } },
  { regel: 'F1c', name: 'Randabstand 0,50', abw: { randAbstand: [0.5, 0.3] }, erwartet: { F1c: '-' } },
  { regel: 'F1d', name: 'Winkel 79', abw: { achsWinkel: 79 }, erwartet: { F1d: 'weich' } },
  { regel: 'F1d', name: 'Winkel 80', abw: { achsWinkel: 80 }, erwartet: { F1d: '-' } },
  { regel: 'F1e', name: 'Busspur nicht durchmarkiert', abw: { busspur: true }, erwartet: { F1e: 'hart' } },
  { regel: 'F2', name: 'Insel 1,49', abw: { insel: ins({ breite: 1.49 }) }, erwartet: { F2: 'hart', F2b: '-' } },
  { regel: 'F2b', name: 'Insel 1,50', abw: { insel: ins({ breite: 1.5 }) }, erwartet: { F2: '-', F2b: 'weich', F2c: 'hinweis' } },
  { regel: 'F2b', name: 'Insel 1,99', abw: { insel: ins({ breite: 1.99 }) }, erwartet: { F2b: 'weich' } },
  { regel: 'F2b', name: 'Insel 2,00', abw: { insel: ins({ breite: 2 }) }, erwartet: { F2b: '-', F2: '-' } },
  { regel: 'F2c', name: 'Insel 1,79', abw: { insel: ins({ breite: 1.79 }) }, erwartet: { F2c: 'hinweis' } },
  { regel: 'F2c', name: 'Insel 1,80', abw: { insel: ins({ breite: 1.8 }) }, erwartet: { F2c: '-' } },
  { regel: 'F2d', name: 'markierte Insel ohne Pflicht', abw: { insel: ins({ art: 'markiert' }), fahrbahnB: 8 }, erwartet: { F2d: 'weich' } },
  { regel: 'F2e', name: 'ohne vertikales Element', abw: { insel: ins({ vertikal: false }) }, erwartet: { F2e: 'hart' } },
  { regel: 'F2f', name: 'Kopf 0,70', abw: { insel: ins({ kopfUeberstand: [0.7, 1] }) }, erwartet: { F2f: 'weich' } },
  { regel: 'F2f', name: 'Kopf 0,75', abw: { insel: ins({ kopfUeberstand: [0.75, 0.75] }) }, erwartet: { F2f: '-' } },
  { regel: 'F2g', name: 'Pfosten 0,95', abw: { insel: ins({ pfostenH: 0.95 }) }, erwartet: { F2g: 'hart' } },
  { regel: 'F2-B', name: 'Insel ohne Furt, Bern', abw: { insel: ins({ furt: 0 }) }, ebenen: BERN, erwartet: { 'F2-B': 'hinweis' } },
  // Nutzerentscheid 23.10.2026: F2-K nach querenden Velos (veloQuerung), nicht mehr nach dem Radstreifen; nur gebaute Insel
  { regel: 'F2-K', name: 'Velos queren, Insel 1,80, Kanton', abw: { veloQuerung: true, insel: ins({ breite: 1.8 }) }, ebenen: KANTON, erwartet: { 'F2-K': 'hinweis' } },
  { regel: 'F2-K', name: 'Velos queren, Insel 2,00, Kanton', abw: { veloQuerung: true, insel: ins({ breite: 2 }) }, ebenen: KANTON, erwartet: { 'F2-K': '-' } },
  { regel: 'F2-K', name: 'Radstreifen ohne querende Velos, Insel 1,80', abw: { radstreifen: true, insel: ins({ breite: 1.8 }) }, ebenen: KANTON, erwartet: { 'F2-K': '-' } },
  { regel: 'F2-K', name: 'querende Velos offen, gebaute Insel 1,80', abw: { veloQuerung: null, insel: ins({ breite: 1.8 }) }, ebenen: KANTON, erwartet: { 'F2-K': 'offen' } },
  { regel: 'F2-K', name: 'querende Velos offen, markierte Insel', abw: { veloQuerung: null, insel: ins({ art: 'markiert', breite: 1.8 }) }, ebenen: KANTON, erwartet: { 'F2-K': '-' } },
  { regel: 'F2-B', name: 'Furt 0,90, Bern', abw: { insel: ins({ furt: 0.9 }) }, ebenen: BERN, erwartet: { 'F2-B': 'hinweis' }, ist: { 'F2-B': '0,90' } },
  { regel: 'F2-B', name: 'Furt 1,20, Bern', abw: { insel: ins({ furt: 1.2 }) }, ebenen: BERN, erwartet: { 'F2-B': '-' } },
  ...([[3.44, 'weich'], [3.45, 'weich'], [3.49, 'weich'], [3.5, 'hinweis'], [3.6, '-'], [3.75, '-'], [3.76, 'weich'], [4.24, 'weich'], [4.25, 'hinweis'], [4.5, '-']] as [number, Erw][])
    .map(([d, e]): Testfall => ({ regel: 'F3', name: `Durchfahrt ${d}`, abw: { insel: INSEL_OK, durchfahrt: [d, 3.6] }, ebenen: KANTON, erwartet: { F3: e } })),
  { regel: 'F3', name: 'Durchfahrt 3,40, Kanton aus', abw: { insel: INSEL_OK, durchfahrt: [3.4, 3.6] }, erwartet: { F3: '-' } },
  { regel: 'F3', name: 'markierte Insel: F3 nicht anwendbar', abw: { fahrbahnB: 8, insel: ins({ art: 'markiert' }), durchfahrt: [3.0, 3.0] }, ebenen: KANTON, erwartet: { F3: '-', 'F3-M': '-' } },
  { regel: 'F3-M', name: 'markierte Insel, Fahrstreifen 2,90', abw: { fahrbahnB: 8, insel: ins({ art: 'markiert' }), durchfahrt: [2.9, 3.1] }, ebenen: KANTON, erwartet: { 'F3-M': 'weich' } },
  { regel: 'F3-M', name: 'markierte Insel 1,40', abw: { fahrbahnB: 8, insel: ins({ art: 'markiert', breite: 1.4 }), durchfahrt: [3.3, 3.3] }, ebenen: KANTON, erwartet: { 'F3-M': 'weich' } },
  { regel: 'F3-M', name: 'markierte Insel, Fahrbahn 7,40', abw: { fahrbahnB: 7.4, insel: ins({ art: 'markiert' }), durchfahrt: [3.0, 3.0] }, ebenen: KANTON, erwartet: { 'F3-M': 'hinweis' } },
  { regel: 'F3-M', name: 'markierte Insel, Fahrbahn 8,50 (AH BE 5.3.2: bis 8,4 m)', abw: { fahrbahnB: 8.5, insel: ins({ art: 'markiert' }), durchfahrt: [3.25, 3.25] }, ebenen: KANTON, erwartet: { 'F3-M': 'hinweis' } },
  { regel: 'F3-B', name: 'Radstreifen, Durchfahrt 4,40, Bern', abw: { radstreifen: true, insel: INSEL_OK, durchfahrt: [4.4, 4.6] }, ebenen: BERN, erwartet: { 'F3-B': 'weich' } },
  { regel: 'F3-B', name: 'Radstreifen, Durchfahrt 4,50, Bern', abw: { radstreifen: true, insel: INSEL_OK, durchfahrt: [4.5, 4.5] }, ebenen: BERN, erwartet: { 'F3-B': '-' } },
  { regel: 'F3-B', name: 'Radstreifen, Durchfahrt 5,60, Bern', abw: { radstreifen: true, insel: INSEL_OK, durchfahrt: [5.6, 5] }, ebenen: BERN, erwartet: { 'F3-B': 'hinweis' } },
  { regel: 'F4a', name: 'MIV mittel, Rest 4,00', abw: { einengung: true, einengungLaengeM: 8, mivKlasse: 'mittel', restbreiteM: 4 }, ebenen: BERN, erwartet: { F4a: 'weich' } },
  { regel: 'F4a', name: 'MIV tief, Rest 3,40', abw: { einengung: true, einengungLaengeM: 8, mivKlasse: 'tief', restbreiteM: 3.4 }, ebenen: BERN, erwartet: { F4a: 'weich' } },
  { regel: 'F4a', name: 'MIV tief, Rest 3,50', abw: { einengung: true, einengungLaengeM: 8, mivKlasse: 'tief', restbreiteM: 3.5 }, ebenen: BERN, erwartet: { F4a: '-' } },
  { regel: 'F4b', name: 'Einengung 4,00 m', abw: { einengung: true, einengungLaengeM: 4, restbreiteM: 5 }, erwartet: { F4b: 'hinweis' } },
  { regel: 'F4c', name: 'FGS mit Einengung 4,50 m, Bern', abw: { einengung: true, einengungLaengeM: 4.5, restbreiteM: 5 }, ebenen: BERN, erwartet: { F4c: 'weich', F4b: 'hinweis' } },
  ...([[1.9, 'weich'], [2.4, 'hinweis'], [3.6, 'hinweis'], [4.1, 'weich'], [3, '-']] as [number, Erw][])
    .map(([b, e]): Testfall => ({ regel: 'F5a', name: `Trottoirüberfahrt ${b}`, abw: { ...EINM, typ: 'trottoirueberfahrt', q3: q3({ breiteM: b }) }, erwartet: { F5a: e } })),
  { regel: 'F5b', name: 'Anrampung 18 %', abw: { ...EINM, typ: 'trottoirueberfahrt', q3: q3({ anrampung: { neigung: 18, laenge: 1 } }) }, erwartet: { F5b: 'weich' } },
  { regel: 'F5b', name: 'Anrampung 0,60 m', abw: { ...EINM, typ: 'trottoirueberfahrt', q3: q3({ anrampung: { neigung: 12, laenge: 0.6 } }) }, erwartet: { F5b: 'weich' } },
  // Ausstattung der Trottoirüberfahrt (VSS 40 242 Tab. 3; 27.10.2026): je Regel beide Ausgänge
  { regel: 'F5c', name: 'Trottoirrand zurückgesetzt', abw: { ...TUE, q3: q3({ randDurchgehend: false }) }, erwartet: { F5c: 'hart' } },
  { regel: 'F5c', name: 'Trottoirrand gerade', abw: { ...TUE, q3: q3({ randDurchgehend: true }) }, erwartet: { F5c: '-' } },
  { regel: 'F5d', name: 'überfahrbarer Rand 26 m', abw: { ...TUE, q3: q3({ ueberfahrbarM: 26 }) }, erwartet: { F5d: 'weich' } },
  { regel: 'F5d', name: 'überfahrbarer Rand 25 m', abw: { ...TUE, q3: q3({ ueberfahrbarM: 25 }) }, erwartet: { F5d: '-' } },
  { regel: 'F5e', name: 'Randsteine an den Einlenkern', abw: { ...TUE, q3: q3({ begrenzung: 'randstein' }) }, erwartet: { F5e: 'weich' } },
  { regel: 'F5e', name: 'keine Begrenzung', abw: { ...TUE, q3: q3({ begrenzung: 'keine' }) }, erwartet: { F5e: 'hinweis' } },
  { regel: 'F5e', name: 'nur Poller', abw: { ...TUE, q3: q3({ begrenzung: 'poller' }) }, erwartet: { F5e: '-' } },
  { regel: 'F5f', name: 'nicht auf 10 m erkennbar', abw: { ...TUE, q3: q3({ erkennbar: false }) }, erwartet: { F5f: 'weich' } },
  { regel: 'F5f', name: 'erkennbar', abw: { ...TUE, q3: q3({ erkennbar: true }) }, erwartet: { F5f: '-' } },
  { regel: 'F5g', name: 'Belag wechselt', abw: { ...TUE, q3: q3({ belag: 'wechsel' }) }, erwartet: { F5g: 'weich', F5h: '-' } },
  { regel: 'F5g', name: 'gleicher Belag', abw: { ...TUE, q3: q3({ belag: 'gleich' }) }, erwartet: { F5g: '-', F5h: '-' } },
  { regel: 'F5h', name: 'Absatz', abw: { ...TUE, q3: q3({ belag: 'absatz' }) }, erwartet: { F5h: 'hart', F5g: '-' } },
  { regel: 'F5h', name: 'Belagwechsel und Absatz', abw: { ...TUE, q3: q3({ belag: 'beides' }) }, erwartet: { F5h: 'hart', F5g: 'weich' } },
  { regel: 'F5i', name: 'Quergefälle 7 %', abw: { ...TUE, q3: q3({ quergefaelle: 7 }) }, erwartet: { F5i: 'hart' } },
  { regel: 'F5i', name: 'Quergefälle 4 %', abw: { ...TUE, q3: q3({ quergefaelle: 4 }) }, erwartet: { F5i: 'hinweis' }, soll: { F5i: '2 % (in der Regel)' } },
  { regel: 'F5i', name: 'Quergefälle 2 %', abw: { ...TUE, q3: q3({ quergefaelle: 2 }) }, erwartet: { F5i: '-' } },
  { regel: 'F5j', name: 'anderer Randabschluss', abw: { ...TUE, q3: q3({ randabschluss: 'anderer' }) }, erwartet: { F5j: 'weich' } },
  { regel: 'F5j', name: 'schräg 4/16', abw: { ...TUE, q3: q3({ randabschluss: 's0416' }) }, erwartet: { F5j: 'hinweis' } },
  { regel: 'F5j', name: 'schräg 6/30', abw: { ...TUE, q3: q3({ randabschluss: 's0630' }) }, erwartet: { F5j: 'hinweis' } },
  { regel: 'F5j', name: 'schräg 6/25', abw: { ...TUE, q3: q3({ randabschluss: 's0625' }) }, erwartet: { F5j: '-' } },
  { regel: 'F5k', name: 'Randsteine daneben schräg', abw: { ...TUE, q3: q3({ randsteineSenkrecht: false }) }, erwartet: { F5k: 'weich' } },
  { regel: 'F5k', name: 'Randsteine daneben senkrecht', abw: { ...TUE, q3: q3({ randsteineSenkrecht: true }) }, erwartet: { F5k: '-' } },
  { regel: 'F5l', name: 'dauernde Signalisation', abw: { ...TUE, q3: q3({ signalisation: true }) }, erwartet: { F5l: 'hart' } },
  { regel: 'F5l', name: 'keine Signalisation', abw: { ...TUE, q3: q3({ signalisation: false }) }, erwartet: { F5l: '-' } },
  { regel: 'F5m', name: 'Wartelinie vorgesehen', abw: { ...TUE, q3: q3({ markierung: true }) }, erwartet: { F5m: 'hart' } },
  { regel: 'F5m', name: 'keine Markierung', abw: { ...TUE, q3: q3({ markierung: false }) }, erwartet: { F5m: '-' } },
  { regel: 'F5n', name: 'ohne Aufmerksamkeitsfelder', abw: { ...TUE, q3: q3({ taktil: false }) }, erwartet: { F5n: 'hart' } },
  { regel: 'F5n', name: 'mit Aufmerksamkeitsfeldern, 3,80 m breit', abw: { ...TUE, q3: q3({ taktil: true, breiteM: 3.8 }) }, erwartet: { F5n: 'hinweis' } },
  { regel: 'F5n', name: 'mit Aufmerksamkeitsfeldern, 3,00 m breit', abw: { ...TUE, q3: q3({ taktil: true, breiteM: 3 }) }, erwartet: { F5n: '-' } },
  { regel: 'F6a', name: 'Mehrzweckstreifen 1,40', abw: { typ: 'mehrzweck', mzsBreiteM: 1.4, v85: 30 }, erwartet: { F6a: 'hart', F6b: '-', F6c: '-' } },
  { regel: 'F6b', name: 'Mehrzweckstreifen 1,80', abw: { typ: 'mehrzweck', mzsBreiteM: 1.8, v85: 30 }, erwartet: { F6b: 'weich', F6a: '-' } },
  // Korrektur 23.10.2026: über 30 bis 40 km/h Hinweis, über 40 km/h Soll
  { regel: 'F6c', name: 'Mehrzweckstreifen V85 35', abw: { typ: 'mehrzweck', v85: 35 }, erwartet: { F6c: 'hinweis' } },
  { regel: 'F6c', name: 'Mehrzweckstreifen V85 40', abw: { typ: 'mehrzweck', v85: 40 }, erwartet: { F6c: 'hinweis' } },
  { regel: 'F6c', name: 'Mehrzweckstreifen V85 41', abw: { typ: 'mehrzweck', v85: 41 }, erwartet: { F6c: 'weich' } },
  { regel: 'F6c', name: 'Mehrzweckstreifen V85 45', abw: { typ: 'mehrzweck', v85: 45 }, erwartet: { F6c: 'weich' } },
  { regel: 'F7a', name: 'vertikal 60 mm', abw: { randabschluss: { art: 'vertikal', hoeheMm: 60, breiteM: null } }, erwartet: { F7a: 'hart' } },
  { regel: 'F7b', name: 'schräg 40 mm, Quergefälle 4 %', abw: { randabschluss: { art: 'schraeg', hoeheMm: 40, breiteM: 0.15 }, quergefaelle: 4 }, erwartet: { F7b: 'hart', F7a: '-' } },
  { regel: 'F7c', name: 'Absenkung 7 %', abw: { absenkung: 7 }, erwartet: { F7c: 'hart' } },
  { regel: 'F7c', name: 'Absenkung 6 %', abw: { absenkung: 6 }, erwartet: { F7c: '-' } },
  { regel: 'F7d', name: 'keine Absenkung, nicht taktil', abw: { absenkung: 0 }, erwartet: { F7d: 'hart' } },
  { regel: 'F7e', name: 'Winkel 70, keine Leitlinie', abw: { achsWinkel: 70 }, erwartet: { F1d: 'weich', F7e: 'weich' } },
  // ── G ──
  { regel: 'G1', name: 'FGS 49 m', abw: { abstandFgsM: 49 }, erwartet: { G1: 'weich' } },
  { regel: 'G1', name: 'FGS 50 m', abw: { abstandFgsM: 50 }, erwartet: { G1: '-' } },
  { regel: 'G1', name: 'FGS 30 m an Verzweigung', abw: { abstandFgsM: 30, verzweigung: true }, erwartet: { G1: '-' } },
  { regel: 'G2', name: 'LSA 124 m', abw: { abstandLsaM: 124 }, erwartet: { G2: 'hart_bericht' } },
  { regel: 'G2', name: 'LSA 125 m', abw: { abstandLsaM: 125 }, erwartet: { G2: '-' } },
  { regel: 'G2', name: 'LSA 80 m an erkennbarer Verzweigung', abw: { abstandLsaM: 80, verzweigungErkennbar: true }, erwartet: { G2: '-' } },
  { regel: 'G3', name: 'Wunschlinie 10,1', abw: { wunschlinieM: 10.1 }, erwartet: { G3: 'weich' } },
  { regel: 'G3', name: 'Wunschlinie 10,0', abw: { wunschlinieM: 10 }, erwartet: { G3: '-' } },
  { regel: 'G3b', name: 'Fussweg nicht einsehbar', abw: { fusswegAchse: { rechtwinkligUneinsehbar: true, versatz: false, umlaufschranke: false } }, erwartet: { G3b: 'hart_bericht' } },
  { regel: 'G4', name: 'Signal fehlt, Strecke', abw: { signal411: false }, erwartet: { G4: 'hart' } },
  { regel: 'G4', name: 'Signal fehlt, vortrittsbelastete Zufahrt', abw: { signal411: false, lage: 'knoten_belastet', rueckversatzM: 5 }, erwartet: { G4: '-' } },
  { regel: 'G4b', name: 'Insel ohne Signal', abw: { insel: INSEL_OK }, erwartet: { G4b: 'weich' } },
  { regel: 'G5', name: 'Annäherungsbereich überfahrbar', abw: { annaeherungUeberfahrbar: true }, erwartet: { G5: 'weich' } },
  { regel: 'G5b', name: 'Ein- oder Ausfahrt', abw: { einAusfahrtNah: true }, erwartet: { G5b: 'weich' } },
  { regel: 'G6', name: 'Rückversatz 3 m', abw: { lage: 'knoten_belastet', rueckversatzM: 3 }, erwartet: { G6: 'weich' } },
  { regel: 'G6', name: 'Rückversatz 5 m', abw: { lage: 'knoten_belastet', rueckversatzM: 5 }, erwartet: { G6: '-' } },
  { regel: 'G6-B', name: 'Rückversatz 8 m, Bern', abw: { lage: 'knoten_belastet', rueckversatzM: 8 }, ebenen: BERN, erwartet: { 'G6-B': 'hinweis', G6: '-' } },
  { regel: 'G7', name: 'Sichtbedarf, keine Linie', abw: { haltenSichtrelevantUeber5m: true, hvlBedarfM: 12 }, erwartet: { G7: 'hart' } },
  { regel: 'G7', name: 'Linie 8 m', abw: { haltenSichtrelevantUeber5m: true, hvlBedarfM: 12, hvl: { vorhanden: true, laengeM: 8, beidseits: false } }, erwartet: { G7: 'hart' } },
  { regel: 'G7', name: 'Linie 12 m, Bedarf 12', abw: { haltenSichtrelevantUeber5m: true, hvlBedarfM: 12, hvl: { vorhanden: true, laengeM: 12, beidseits: false } }, erwartet: { G7: '-' } },
  { regel: 'G7', name: 'Halten sonst verboten', abw: { haltenSichtrelevantUeber5m: true, haltenSonstVerboten: true }, erwartet: { G7: '-' } },
  { regel: 'G7b', name: 'Linie ohne Sichtbedarf', abw: { hvl: { vorhanden: true, laengeM: 10, beidseits: false } }, erwartet: { G7b: 'hinweis' } },
  { regel: 'G8a', name: 'ohne Beleuchtung', abw: { beleuchtung: false }, erwartet: { G8a: 'hart', G8b: '-' } },
  { regel: 'G8b', name: 'Schatten', abw: { schattenfrei: false }, erwartet: { G8b: 'weich' } },
  { regel: 'G9', name: 'Reklame 15 m', abw: { reklameUnter20m: true }, erwartet: { G9: 'hart' } },
  { regel: 'G9', name: 'Reklame verkehrserzieherisch', abw: { reklameUnter20m: true, reklameAusnahme: true }, erwartet: { G9: '-' } },
  { regel: 'G10a', name: 'Warnlicht nicht SSV', abw: { blinklicht: 'nicht_ssv' }, erwartet: { G10a: 'hart' } },
  { regel: 'G10b', name: 'gelbes Blinklicht', abw: { blinklicht: 'gelb_ssv' }, erwartet: { G10b: 'weich' } },
  // ── H ──
  { regel: 'H1', name: 'Sicht 54,9', abw: { sichtVorh: [54.9, 70] }, erwartet: { H1: 'hart' }, soll: { H1: '55' } },
  { regel: 'H1', name: 'Sicht 55,0', abw: { sichtVorh: [55, 70] }, erwartet: { H1: '-' } },
  { regel: 'H1b', name: 'V85 57 mit Anzeichen', abw: { v85: 57, anzeichenSchneller: true }, erwartet: { H1: 'hart', H1b: 'hinweis' }, soll: { H1: '75' } },
  { regel: 'H1b', name: 'V85 57 gemessen ohne Anzeichen, Sicht 60', abw: { v85: 57, v85Nachweis: true, sichtVorh: [60, 60] }, erwartet: { H1: 'hart', H1b: 'hinweis' }, soll: { H1: '75' } },
  { regel: 'H1b', name: 'V85 57 ohne Nachweis und ohne Anzeichen', abw: { v85: 57, v85Nachweis: false, sichtVorh: [60, 60] }, erwartet: { H1: '-', H1b: '-' } },
  { regel: 'H1', name: 'V85 38 nachgewiesen, Sicht 45', abw: { v85: 38, sichtVorh: [45, 45] }, erwartet: { H1: '-' } },
  { regel: 'H2', name: 'Radius 25, fünf Bedingungen, Sicht 36', abw: { kurve: { radius: 25, fuenfBedingungen: true }, sichtVorh: [36, 36] }, erwartet: { H2: 'hinweis', H1: '-' } },
  { regel: 'H2', name: 'Radius 25, Bedingung fehlt, Sicht 36', abw: { kurve: { radius: 25, fuenfBedingungen: false }, sichtVorh: [36, 36] }, erwartet: { H2: '-', H1: 'hart' }, soll: { H1: '55' } },
  { regel: 'H2', name: 'Radius 20, fünf Bedingungen, Sicht 25 (bfu 24 m, Norm 30 m)', abw: { kurve: { radius: 20, fuenfBedingungen: true }, sichtVorh: [25, 25] }, erwartet: { H2: 'hinweis', H1: '-' }, soll: { H2: '24' } },
  { regel: 'H3a', name: 'Erkennung 54 (Soll 55)', abw: { erkennungM: 54 }, erwartet: { H3a: 'hart', H3b: '-' } },
  { regel: 'H3b', name: 'Erkennung 100', abw: { erkennungM: 100 }, erwartet: { H3b: 'weich', H3a: '-' } },
  { regel: 'H3b', name: 'Erkennung 110', abw: { erkennungM: 110 }, erwartet: { H3b: '-' } },
  { regel: 'H4', name: 'Knotenradius 10 m', abw: { kurve: { radius: 10, fuenfBedingungen: false } }, erwartet: { H4: 'hinweis' }, soll: { H4: '15 m' } },
  // ── I ──
  { regel: 'I1', name: 'L 12, Gelb 5', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 5, freigabe: 8 }) }, erwartet: { I1: 'hart' }, soll: { I1: '6 oder 7' } },
  { regel: 'I1', name: 'L 12, Gelb 6 (abgerundet, zulässig)', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 6, freigabe: 8 }) }, erwartet: { I1: '-' } },
  { regel: 'I1', name: 'L 12, Gelb 8', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 8, freigabe: 8 }) }, erwartet: { I1: 'hart' } },
  { regel: 'I1', name: 'L 12, Gelb 7 (aufgerundet, zulässig)', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 8 }) }, erwartet: { I1: '-' } },
  { regel: 'I2', name: 'L 12, Freigabe 6', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 6 }) }, erwartet: { I2: 'hart' }, soll: { I2: '6,67' } },
  { regel: 'I2', name: 'L 12, Freigabe 7', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 7 }) }, erwartet: { I2: '-' } },
  { regel: 'I2', name: 'L 3, Freigabe 3', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 3, gelb: 2, freigabe: 3 }) }, erwartet: { I2: 'hart' }, soll: { I2: '4,00' } },
  { regel: 'I3a', name: 'Insel phasengleich, Freigabe 6', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 10, teile: [4, 4], inselB: 2, freigabe: 6, gelb: 6 }) }, erwartet: { I3a: 'hart' }, soll: { I3a: '6,11' } },
  { regel: 'I3a', name: 'Insel phasengleich, Freigabe 6,2', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 10, teile: [4, 4], inselB: 2, freigabe: 6.2, gelb: 6 }) }, erwartet: { I3a: '-' } },
  { regel: 'I3b', name: 'phasengetrennt, nicht im selben Umlauf', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 10, teile: [4, 4], inselB: 2, phasengleich: false, beideRichtungenImZyklus: false }) }, erwartet: { I3b: 'hart' } },
  { regel: 'I4', name: 'L 12, Freigabe 7, Gelb 7', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 7 }) }, erwartet: { I4: 'hart' } },
  { regel: 'I4', name: 'L 12, Freigabe 8, Gelb 7', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 8 }) }, erwartet: { I4: '-' } },
  { regel: 'I5', name: 'Vorstart 5 s', abw: { typ: 'lsa', lsaZeiten: lsa({ abbiegerKonflikt: true, vorstart: 5 }) }, erwartet: { I5: 'weich' } },
  { regel: 'I6', name: 'Wartezeit 31', abw: { typ: 'lsa', lsaZeiten: lsa({ wartezeit: 31 }) }, erwartet: { I6: 'weich' } },
  { regel: 'I6', name: 'Wartezeit 30', abw: { typ: 'lsa', lsaZeiten: lsa({ wartezeit: 30 }) }, erwartet: { I6: '-' } },
  { regel: 'I6-B', name: 'Wartezeit 25 (Stufe C), Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ wartezeit: 25 }) }, ebenen: BERN, erwartet: { 'I6-B': '-' } },
  { regel: 'I6-B', name: 'Wartezeit 35, Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ wartezeit: 35 }) }, ebenen: BERN, erwartet: { 'I6-B': 'hinweis' }, ist: { 'I6-B': 'Stufe D' } },
  { regel: 'I6-B', name: 'Wartezeit 46, Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ wartezeit: 46 }) }, ebenen: BERN, erwartet: { 'I6-B': 'weich' }, ist: { 'I6-B': 'Stufe F' } },
  { regel: 'I6-B', name: 'Wartezeit 46 mit Insel, Bern', abw: { typ: 'lsa', insel: INSEL_OK, lsaZeiten: lsa({ wartezeit: 46 }) }, ebenen: BERN, erwartet: { 'I6-B': 'weich' }, ist: { 'I6-B': 'Stufe E' } },
  { regel: 'I7-B1', name: 'Freigabe 4, L 7,2, Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 7.2, gelb: 4, freigabe: 4 }) }, ebenen: BERN, erwartet: { 'I7-B1': 'hart', I2: '-' } },
  { regel: 'I7-B2', name: 'L 12, Gelb 7, Freigabe 3, Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 3 }) }, ebenen: BERN, erwartet: { 'I7-B2': '-' } },
  { regel: 'I7-B2', name: 'L 12, Gelb 7, Freigabe 2,9, Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 2.9 }) }, ebenen: BERN, erwartet: { 'I7-B2': 'hart' } },
  { regel: 'I7-B3', name: 'Insel ohne Gerät, nur Anmeldung, Gelb 7, Bern', abw: { typ: 'lsa', insel: INSEL_OK, lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 8, inselGeraet: false, inselNurAnmeldung: true }) },
    ebenen: BERN, erwartet: { 'I7-B3': 'hart', I8: 'hart' }, soll: { 'I7-B3': '8' } },
  { regel: 'I7-B3', name: 'Insel ohne Gerät, nur Anmeldung, Gelb 8, Bern', abw: { typ: 'lsa', insel: INSEL_OK, lsaZeiten: lsa({ L: 12, gelb: 8, freigabe: 8, inselGeraet: false, inselNurAnmeldung: true }) },
    ebenen: BERN, erwartet: { 'I7-B3': '-' } },
  { regel: 'I7-B4', name: 'L 12, Freigabe 5, Bern', abw: { typ: 'lsa', lsaZeiten: lsa({ L: 12, gelb: 7, freigabe: 5 }) }, ebenen: BERN, erwartet: { 'I7-B4': 'hart', 'I7-B1': '-' }, soll: { 'I7-B4': '7' } },
  { regel: 'I8', name: 'Insel ohne Anforderungsgerät', abw: { typ: 'lsa', insel: INSEL_OK, lsaZeiten: lsa({ inselGeraet: false }) }, erwartet: { I8: 'hart' } },
]
