// ── Rechnung E0 bis E3c: Knoten bzw. Grundstückzufahrt, Zufahrt, Beobachtungspunkt, Fahrstreifenachsen, Sicht je Richtung,
//    Status, Annahmen, Massnahmen nach Ziffer 14 ──
//
// Ablauf: Kontext aus AV und OSM (Netz, Fahrbahn, Trottoir, Gebäude), Knoten und Arme, Vortrittsstrasse, Zufahrt (gewählt
// bzw. eindeutiger Vorschlag; E2b auch Grundstückzufahrt ab einem Zufahrtspunkt, grundstueck.ts), Vortrittsregelung (Eingabe
// bzw. OSM highway=stop an der Zufahrt), Strassentyp und ungünstige Verhältnisse (Eingabe bzw. Vorgabe aus OSM), Querschnitte,
// nächstliegender Rand, Achse des Zufahrtsstreifens, Nullpunkt (Kante, Haltelinie bzw. Trottoirhinterkante), B und D (bzw. D
// von Hand), je Richtung Tempo (OSM bzw. von Hand), Tab. 1 nach
// Strassentyp, Anhaltesichtweite bei der Neigung, Fahrstreifenachse, Kreuzungspunkt K, Zielpunkte je 1 m bis 1,5 × oberer
// Wert, Sicht gegen die AV-Gebäude und die Hindernisse (E2a: von Hand, bestätigte Vorschläge, amtliche Parkfelder; Palisade
// für Bäume), Status und Sichtdreieck, nötiger AV-Ausschnitt, Vorschläge (OSM-Parkierung im Sichtfeld, Baumkataster). Alle
// Annahmen kommen als Text zurück und stehen in der Seite.
// E3a: Längsneigung je Richtung von Hand bzw. als Vorgabe aus dem Höhenmodell (fall.hoehen, geholt von der App entlang der
// profilLinie je Richtung und des zufahrtProfil); Massnahmen nach Ziffer 14 (massnahmen.ts) als Varianten dieser Rechnung.
// E3b: je Richtung die Prüfung des Veloverkehrs auf der Veloachse (velo.ts, Tab. 3; Radstreifen verschiebt die Autoachse, ein Radweg
// näher als 2,00 m den Nullpunkt von B), mit Trottoir an der Zufahrt die Prüfung des Trottoirverkehrs von D' aus (Tab. 2); der
// Gesamtstatus je Richtung ist der schlechteste der Teile (Entscheid 1).
// E3c: bei Rechtsvortritt an einem Knoten Teil E (rechtsvortritt.ts): Arme links und rechts der Zufahrt statt der Vortrittsstrasse,
// Nullpunkt am Rand des rechten Arms, B 5,00 m, Tempo 30 km/h fest; nach rechts die Sicht auf die Fahrstreifenachse des rechten Arms
// mit dem Zustand nach Abb. 6 (Wahrnehmbarkeit als Eingabe), bei schmaler Zufahrt die Paarmatrix nach Abb. 5; von links keine
// Prüfung (dieser Verkehr muss der Zufahrt den Vortritt lassen); auf Wunsch dieselbe Rechnung für jeden Arm.
//
// K0 (23.10.2026): Trottoirüberfahrt und amtliches Tempo. Schnittstelle «Knotensicht einer Zufahrt mit Trottoirüberfahrt» (auch für
// die Kopie in fgsCheck; Kern = rechner/ und daten/osm.ts, daten/av.ts, daten/parkkataster.ts, daten/baumkataster.ts, daten/holen.ts,
// daten/vsig.ts, daten/hoehen.ts, geo.ts, ohne UI):
//
//   rechneKnoten(osm, av, {
//     knoten, zufahrt,                       // OSM-Knoten und Arm «wid:i:sd» (bzw. zufahrtspunkt für eine Ausfahrt ohne Knoten)
//     eingaben: { ...KEINE_ALLE_EINGABEN, trottoirueberfahrt: { breite: null | m } },
//     hindernisse, avZentrum, hoehen,
//     tempoAmtlich: { linien, bereich, quelle } | null,   // Stadt Bern: V_sig des Geoportals (daten/vsig.ts), sonst null = OSM
//   }) -> Rechnung; ergebnis.trottoirueberfahrt: TueErgebnis (Breite mit Herkunft, vorderer und hinterer Rand, Status je Phase),
//      Phase Trottoir = ergebnis.trottoirPruefung (D' 3,00 m hinter dem hinteren Rand, Zielpunkte auf der Gehlinie 0,50 m vor dem
//      hinteren Trottoirrand, Tab. 2), Phase Fahrbahn = ergebnis.richtungen (Auto Tab. 1, Velo Tab. 3, B ab der Bordkante).
//
// Im Modus gilt (VSS 40 242 Ziffern 12.3, 14.4): kein Rechtsvortritt (Vorgabe Vortritt bzw. Stop aus OSM; «Rechtsvortritt» gewählt:
// gerechnet wie Vortritt), Nullpunkt von B an der Bordkante (vorderer Rand der Überfahrt; eine Haltelinie bzw. ein Radweg nach Ziffer 12
// gehen vor), Sicht aufs Trottoir ab dem hinteren Rand mit der Gehlinie; Breite der Überfahrt in trottoirueberfahrt.ts. Ohne Modus
// rechnet der Kern wie 0.5.0 (Trottoirachse in der Mitte, Nullpunkt an der Trottoirhinterkante bzw. mit «ohne Hindernisse» an der
// Bordkante). Amtliches Tempo: je Richtung Mehrheit entlang der Mittellinie des Arms (tempo.amtlichEntlang; überwiegen die Punkte an
// einer Linie ohne Wert, gilt OSM), vor OSM, von Hand geht vor.

import { type P, lv95, wgs, neg, drehung, kreuz, dist, links, imPolygon, wdiff, sub, add, abstandStrecke } from '../geo'
import type { OsmDaten } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz, abschneiden } from './netz'
import { Fahrbahn, Gebaeude, Flaechen } from './flaechen'
import { OsmAchsen } from './achsen'
import { fahrstreifenmitte, lageOsm, LAGE_ERSATZ } from './fahrstreifen'
import { punkteAufSpur } from './spur'
import { wegTempo, tempoEntlang, zonenTempo, amtlichEntlang, TEMPO_ERSATZ } from './tempo'
import { tueBand, TUE_GEHLINIE_M, TUE_BREITE_ANNAHME_M, type TueBand } from './trottoirueberfahrt'
import { sichtweiteA, zielLaenge, sichtStatus, istHvsHighway, TAB1, TAB1_MAX, ZIEL_FAKTOR, STRASSENTYP_TEXT, NEIGUNG_GROSS_PROZENT,
  NEIGUNG_EBEN_PROZENT, type Strassentyp, type Ungunst, HVS_HIGHWAY } from './sichtweite'
import { knotenInfo, vortrittPaar, vortrittsSignale, signalAnArm, armText, nachNr } from './knoten'
import { grundstueckGeometrie, type GrundstueckGeo } from './grundstueck'
import { parkStreifen, sondenRechts, parkStreifenText, KEIN_PARKSTREIFEN, PARK_SONDE_RADIUS_M, PARK_EIN_FELD_TREFFER,
  type ParkStreifen } from './hauptachsen'
import { armMittellinie, muendungGeglaettet, querschnitt, fahrstreifenAchse, versetzt, mitVerlaengerung, schnittBei, lot, abBogen, D_MFZ_M,
  VERLAENGERUNG_M, type Querschnitt } from './hauptachsen'
import { massnahmenRechnen, type Variante, type VarianteRichtung } from './massnahmen'
import { PROFIL_MIN_M, ZUFAHRT_STEIL_PROZENT } from './neigung'
import { B_INNERORTS_M, istAusserorts, beobachtungsdistanz, beobachtungspunkt, beobachtungAb, lageAnAchse, trottoirAnZufahrt, querlinie,
  FAHRERSITZ_M } from './beobachtung'
import { sichtEntlang, sichtdreieck, PALISADE_MIN_M, type Verdeckend } from './sicht'
import { veloSichtweite, trottoirSichtweite, radwegLinien, radwegNeben, veloVorgabe, trottoirNeben, richtungsAenderung, KURVE_GRAD,
  D_VELO_M, RADSTREIFEN_M, RADWEG_BREITE_M, RADWEG_NAH_M, VELOFUEHRUNG_TEXT, TAB2, type RadwegLinie, type RadwegLage,
  type Velofuehrung } from './velo'
import { rechterArm, rechteArme, linkerArm, RECHTS_MIN_GRAD, zustandAbb6, rvMindest, paarmatrix, RV_TEMPO, RV_B_M, RV_A_M, RV_ZIEL_M, SCHMAL_M, PAAR_LAENGE_M,
  PAAR_SCHRITT_M, WAHRNEHMBARKEIT_VORGABE, WAHRNEHMBARKEIT_TEXT, WAHRNEHMBARKEITEN, ZUSTAND_TEXT, ABB6_GRENZEN, type Wahrnehmbarkeit,
  type Zustand } from './rechtsvortritt'
import { hindernisVerdeckend, HindernisDaten, BAUM_STAMM_M, LINIE_PUFFER_M, type Hindernis, type ParkRaster } from './hindernisse'
import { PARKSTREIFEN, PARK_SONDE_M, PARK_MIN_TREFFER, type AbzugQuelle } from './fahrstreifen'
import { parkVorschlaege, baumVorschlaege, parkKatasterFelder, osmUeberdeckt, imSichtfeld } from './vorschlaege'
import { KEINE_EINGABEN, KEINE_HINDERNISSE, KEINE_KNOTEN_EINGABEN, type ArmInfo, type Ergebnis, type HindernisEingaben,
  type HindernisStand, type KnotenEingaben, type KnotenFall, type KnotenInfo, type Rechnung, type Regelung, type Richtung,
  type RichtungErgebnis, type SichtEingaben, type StrasseErgebnis, type TempoArt, type TempoEingabe, type VerdeckerEintrag,
  type HaltelinieErgebnis, type TrottoirErgebnis, type VortrittsHinweis, type HoehenVorgabe, type NeigungMessung, type SichtTeil,
  type VeloErgebnis, type TrottoirPruefung, type TrottoirRichtung, type RichtungStatus, type RvArm, type RvStatus,
  type RechtsvortrittErgebnis, type Lage, type TempoAmtlichDaten, type TueErgebnis, type TuePhase, TUE_BREITE_MIN,
  TUE_BREITE_MAX } from './typen'
import { GEGENUEBER_GRAD, geradeausWinkel, lageVon, lageKurz, lageNach, lageWort } from './lage'

/** Abruf um den Knoten (App): AV ±150 m, OSM Umkreis 300 m */
export const AV_RADIUS_M = 150
export const OSM_RADIUS_M = 300
/** amtliche Parkfelder und Baumkataster (map.bern.ch): Ausschnitt um den Knoten wie die AV */
export const KATASTER_RADIUS_M = AV_RADIUS_M
/** AV nach Bedarf nachladen (App): weitester Zielpunkt ab Knoten plus Reserve, höchstens AV_MAX_M */
export const AV_RESERVE_M = 20
export const AV_MAX_M = 400
/** Radius für das Nachladen der AV: der Bedarf (weitester Zielpunkt plus Reserve), höchstens AV_MAX_M; null = kein Nachladen
 *  nötig (Bedarf gedeckt bzw. schon AV_MAX_M geladen) */
export function avNachladen(bedarf: number, geladen: number): number | null {
  if (bedarf <= geladen || geladen >= AV_MAX_M) return null
  return Math.min(bedarf, AV_MAX_M)
}
/** Länge der Mittellinien der vortrittsberechtigten Arme: 1,5 × grösster oberer Wert und Reserve für K */
const ARM_LAENGE_M = Math.ceil(ZIEL_FAKTOR * TAB1[TAB1_MAX][1]) + 60
/** Zufahrt: Mittellinie und Querschnitt (fahrstreifenmitte) ab dem Rand der Vortrittsstrasse plus ZUF_VON_M bis plus ZUF_BIS_M */
const ZUF_LAENGE_M = 80
const ZUF_VON_M = 4
const ZUF_BIS_M = 34
const ZUF_SCHRITT_M = 2
/** nächstliegender Rand: so weit entlang der Arme gezeichnet */
const RAND_LAENGE_M = 60
/** Einbiegewinkel unter diesem Wert (bzw. über 180° minus diesem Wert) gilt als schief (Annahme zu B) */
const SCHIEF_UNTER = 75
/** Haltelinie (E2b): höchstens so weit neben der Zufahrtsachse geklickt, höchstens so weit vor bzw. hinter der Kante */
export const HALTELINIE_SEITLICH_M = 6
export const HALTELINIE_VOR_M = 6
export const HALTELINIE_HINTER_M = 30
/** Haltelinie auf der Karte: so weit beidseits der Achse */
const HALTELINIE_HALB_M = 1.5
/** D von Hand: Hinweis, wenn weiter als so weit vom Nullpunkt */
export const D_HAND_WEIT_M = 30
/** Signal an einer Grundstückzufahrt: bis so weit neben den ersten Metern der Zufahrt */
const SIGNAL_ZUFAHRT_M = 4

export const REGELUNG_TEXT: Record<Regelung, string> = { vortritt: 'Vortritt', stop: 'Stop', rechtsvortritt: 'Rechtsvortritt' }
export const TEMPO_ART_TEXT: Record<TempoArt, string> = {
  signalisiert: 'signalisierte Höchstgeschwindigkeit', vp: 'Projektierungsgeschwindigkeit VP', v85: 'V85',
  fahrbar: 'fahrbares Tempo bei Verkehrsberuhigung',
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
/** Neigung mit Vorzeichen, Dezimalkomma */
const fi = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '±') + String(Math.abs(Math.round(x * 10) / 10)).replace('.', ',')

export interface Kontext { netz: OsmNetz; achsen: OsmAchsen; fahrbahn: Fahrbahn; trottoir: Flaechen; gebaeude: Verdeckend[]; osm: OsmDaten
  radwege: RadwegLinie[] }

/** Kontext aus OSM und AV (verdeckend sind die Gebäude der AV; Hindernisse kommen je Rechnung dazu) */
export function kontextBauen(osm: OsmDaten, av: AvFlaeche[]): Kontext {
  const netz = new OsmNetz(osm)
  const geb = new Gebaeude(av)
  return { netz, achsen: new OsmAchsen(netz), fahrbahn: new Fahrbahn(av), trottoir: new Flaechen(av, ['Trottoir']), osm,
    radwege: radwegLinien(osm.querungen ?? []),
    gebaeude: geb.r.teile.map((t, i) => ({ poly: t.poly, id: `gebaeude:${i}`, name: 'Gebäude (AV)', art: 'Gebäude', quelle: 'AV' })) }
}

const leer = (meldung: string, t0: number, knoten: Rechnung['knoten'] = null): Rechnung =>
  ({ knoten, ergebnis: null, meldungen: [meldung], ms: performance.now() - t0 })

/** Eingaben zum Knoten aus dem Fall (fehlende Felder: Vorgabe) */
export function knotenEingabenAus(e: Partial<KnotenEingaben> | undefined): Required<KnotenEingaben> {
  return { regelung: e?.regelung ?? null, haltelinie: e?.haltelinie ?? null, D: e?.D ?? null, trottoirFrei: e?.trottoirFrei ?? false,
    tempo: { links: e?.tempo?.links ?? null, rechts: e?.tempo?.rechts ?? null }, velo: { links: e?.velo?.links ?? null,
      rechts: e?.velo?.rechts ?? null }, ebikeVerboten: e?.ebikeVerboten ?? false, wahrnehmbarkeit: e?.wahrnehmbarkeit ?? null,
    alleArme: e?.alleArme ?? false, trottoirueberfahrt: e?.trottoirueberfahrt ?? null }
}

/** Rechnung für den gewählten Knoten und die Zufahrt (ohne Zufahrt: Vorschlag, sonst nur Knoten und Arme) bzw. für eine
 *  Grundstückzufahrt (fall.zufahrtspunkt); avRadius = Halbseite des geladenen AV-Ausschnitts (für den Hinweis und den Bedarf an
 *  Nachladen), fall.avZentrum seine Mitte (Vorgabe: Knotenpunkt) */
export function rechneKnoten(osm: OsmDaten, av: AvFlaeche[], fall: KnotenFall, kx: Kontext | null = null,
  avRadius = AV_RADIUS_M): Rechnung {
  const t0 = performance.now()
  const k = kx ?? kontextBauen(osm, av)
  const { netz } = k
  const eg: SichtEingaben = fall.eingaben ? { typ: fall.eingaben.typ, fahrstreifen: fall.eingaben.fahrstreifen,
    neigungGross: fall.eingaben.neigungGross, schwerverkehr: fall.eingaben.schwerverkehr, neigung: fall.eingaben.neigung } : KEINE_EINGABEN
  const ke = knotenEingabenAus(fall.eingaben ?? KEINE_KNOTEN_EINGABEN)
  const hg = fall.hindernisse ?? KEINE_HINDERNISSE
  const keineAv = 'Keine AV-Fahrbahn am Knoten: Rechnung nicht möglich (AV nicht frei bzw. ausserhalb der Schweiz).'
  if (fall.zufahrtspunkt) {
    // Grundstückzufahrt: Knotenpunkt auf der Vortrittsstrasse, Arme ab dort
    const g = grundstueckGeometrie(netz, k.achsen, k.fahrbahn, fall.zufahrtspunkt)
    if (typeof g === 'string') return leer(g, t0)
    const info: KnotenInfo = { id: 0, p: g.kp, ll: wgs(g.kp[0], g.kp[1]), name: `Grundstückzufahrt, Vortrittsstrasse ${g.strasse}`,
      arme: [...g.arme, g.zArm], vortritt: [g.arme[0].key, g.arme[1].key], vortrittGrund: g.grund, vorschlag: g.zArm.key,
      signale: vortrittsSignale(osm, g.kp, lv95), grundstueck: true }
    if (!av.some(f => f.art === 'Strasse_Weg')) return leer(keineAv, t0, info)
    const ergebnis = rechneZufahrt(k, info, g.zArm, false, eg, ke, avRadius, hg, fall.avZentrum ?? g.kp, g, fall.hoehen ?? null,
      fall.tempoAmtlich ?? null)
    return { knoten: info, ergebnis, meldungen: [], ms: performance.now() - t0 }
  }
  if (fall.knoten === null) return leer('Knoten bzw. Zufahrtspunkt wählen.', t0)
  if (!netz.P.has(fall.knoten)) return leer(`OSM-Knoten ${fall.knoten} nicht in den OSM-Daten.`, t0)
  const kp = netz.p(fall.knoten)
  const info = knotenInfo(netz, fall.knoten, vortrittsSignale(osm, kp, lv95))
  if (!info) return leer(`OSM-Knoten ${fall.knoten} hat weniger als drei Strassenarme (ohne service): kein Knoten nach E0.`, t0)
  const zKey = fall.zufahrt ?? info.vorschlag
  if (!zKey) return leer('Zufahrt wählen: welcher Arm ist vortrittsbelastet?', t0, info)
  const zArm = info.arme.find(a => a.key === zKey)
  if (!zArm) return leer('Die gewählte Zufahrt gehört nicht zu diesem Knoten.', t0, info)
  if (!av.some(f => f.art === 'Strasse_Weg')) return leer(keineAv, t0, info)
  const ergebnis = rechneZufahrt(k, info, zArm, fall.zufahrt === null, eg, ke, avRadius, hg, fall.avZentrum ?? kp, null, fall.hoehen ?? null,
    fall.tempoAmtlich ?? null)
  return { knoten: info, ergebnis, meldungen: [], ms: performance.now() - t0 }
}

/** Strassentyp und ungünstige Verhältnisse der vortrittsberechtigten Strasse: Eingabe, sonst Vorgabe aus OSM highway und lanes
 *  bzw. aus der Neigung (|i| > 4 % in einer Richtung; neigung: wie gerechnet, von Hand bzw. aus dem Höhenmodell) */
export function strasseBestimmen(netz: OsmNetz, arme: ArmInfo[], eg: SichtEingaben,
  neigung: Record<Richtung, number> = { links: eg.neigung.links ?? 0, rechts: eg.neigung.rechts ?? 0 }): StrasseErgebnis {
  const hws = [...new Set(arme.map(a => a.hw))]
  const typVorgabe: Strassentyp = hws.some(istHvsHighway) ? 'hvs' : 'es'
  // lanes, auch «2;3» (je Abschnitt): grösster Wert
  const lanes = arme.flatMap(a => (netz.w(a.wid).t.lanes ?? '').split(';').map(x => Number.parseFloat(x))).filter(Number.isFinite)
  const lanesMax = lanes.length ? Math.max(...lanes) : null
  const ungunstVorgabe = {
    fahrstreifen: lanesMax !== null && lanesMax > 2,
    neigung: Object.values(neigung).some(i => Math.abs(i) > NEIGUNG_GROSS_PROZENT + 1e-9),
  }
  const ungunst: Ungunst = { fahrstreifen: eg.fahrstreifen ?? ungunstVorgabe.fahrstreifen, neigung: eg.neigungGross ?? ungunstVorgabe.neigung,
    schwerverkehr: eg.schwerverkehr }
  return { typ: eg.typ ?? typVorgabe, typVorgabe, typQuelle: `OSM highway=${hws.join(' / ')}`, typGewaehlt: eg.typ !== null, ungunst,
    ungunstVorgabe, fahrstreifenQuelle: lanesMax !== null ? `OSM lanes=${String(lanesMax).replace('.', ',')}` : 'ohne OSM lanes' }
}

/** Abstand über den weitesten Zielpunkt hinaus, bis zu dem amtliche Parkfelder und Bäume angezeigt werden [m] */
const REICHWEITE_RESERVE_M = 10

/** Hindernisse für die Rechnung: Eingaben (von Hand, bestätigte Vorschläge) und amtliche Parkfelder ohne verworfene */
export function zaehlendeHindernisse(hg: HindernisEingaben): Hindernis[] {
  const weg = new Set(hg.verworfen)
  const amtlich: Hindernis[] = (hg.park?.felder ?? []).filter(f => !weg.has(f.id) && f.ring.length >= 3)
    .map(f => ({ id: f.id, art: 'parkfeld', klasse: f.klasse, ring: f.ring, quelle: 'kataster', name: f.name }))
  return [...hg.hindernisse, ...amtlich]
}

/** Tags der Vortrittsstrasse für die Vorgabe der Regelung: highway, Tags, Tempo (maxspeed bzw. Zone, km/h) */
export interface VortrittsstrasseTags { hw: string; t: Record<string, string>; tempo: number | null }
/** Vorgabe der Vortrittsregelung (Entscheid 17.10.2026): Signale an der Zufahrt gehen vor (highway=stop -> Stop, give_way ->
 *  Vortritt). Ohne Signal nach der Vortrittsstrasse: Hauptverkehrsstrasse (trunk/primary/secondary/tertiary inkl. _link,
 *  priority_road, maxspeed ab 50 km/h) -> Vortritt; Quartierstrasse (residential, living_street) mit Tempo 30 bzw. 20 oder
 *  unclassified in einer Tempo-30-Zone (zone:maxspeed, maxspeed:type) -> Rechtsvortritt (SVG Art. 36 Abs. 2, in Tempo-30-Zonen
 *  die Regel); sonst Vortritt. An einer Grundstückzufahrt gilt kein Rechtsvortritt (VRV Art. 15 Abs. 3). Alles ohne Signal ist
 *  eine Annahme (Quelle beginnt mit «ohne Signal in OSM»). K0: an einer Trottoirüberfahrt gilt kein Rechtsvortritt (VSS 40 242
 *  Ziffer 12.3). */
export function regelungVorgabe(signaleZufahrt: VortrittsHinweis[], strasse: VortrittsstrasseTags[] = [], grundstueck = false,
  trottoirueberfahrt = false): [Regelung, string] {
  if (signaleZufahrt.some(s => s.art === 'stop')) return ['stop', 'OSM highway=stop an der Zufahrt']
  if (signaleZufahrt.some(s => s.art === 'give_way')) return ['vortritt', 'OSM highway=give_way («Kein Vortritt») an der Zufahrt']
  if (grundstueck) return ['vortritt', 'ohne Signal in OSM; an einer Grundstückzufahrt gilt kein Rechtsvortritt']
  if (trottoirueberfahrt) return ['vortritt', 'ohne Signal in OSM; an einer Trottoirüberfahrt gilt kein Rechtsvortritt (VSS 40 242 Ziffer 12.3)']
  const hvs = strasse.find(x => HVS_HIGHWAY.includes(x.hw.replace(/_link$/, '')) || ['designated', 'yes'].includes(x.t.priority_road ?? '') ||
    (x.tempo ?? 0) >= 50)
  if (hvs) {
    const grund = HVS_HIGHWAY.includes(hvs.hw.replace(/_link$/, '')) ? `highway=${hvs.hw}` : hvs.t.priority_road ? `priority_road=${hvs.t.priority_road}` :
      `maxspeed ${hvs.tempo} km/h`
    return ['vortritt', `ohne Signal in OSM; Vortrittsstrasse ${grund}`]
  }
  const zone = (x: VortrittsstrasseTags) => zonenTempo(x.t['zone:maxspeed']) ?? zonenTempo(x.t['maxspeed:type'])
  const quartier = strasse.length > 0 && strasse.every(x => (['residential', 'living_street'].includes(x.hw) && (x.tempo ?? 99) <= 30) ||
    (x.hw === 'unclassified' && (zone(x) ?? 99) <= 30))
  if (quartier) {
    const z = strasse.map(zone).find(v => v !== null && v <= 30)
    return ['rechtsvortritt', `ohne Signal in OSM; Quartierstrasse mit Tempo ${Math.min(...strasse.map(x => x.tempo ?? 30))} km/h` +
      `${z !== undefined ? ' (Tempo-30-Zone)' : ''}`]
  }
  return ['vortritt', 'ohne Signal in OSM']
}

/** Längsneigung einer Richtung: von Hand, sonst Vorgabe aus dem Höhenmodell (E3a), sonst 0 % */
interface NeigungStand { i: number; vorgabe: number; hand: boolean; quelle: string; vorgabeQuelle: string; gemessen: boolean
  hinweis: string | null }
// hoehenDa: die App hat die Profile zu diesem Fall geholt (Fall.hoehen gesetzt). Vorher (null) lädt das Höhenmodell noch: der
// Bericht wartet darauf. Fehlt danach die Messung einer Richtung, wurde für sie kein Profil geholt (nicht geprüft, kein Verkehr):
// kein «lädt», sonst wartete der Druck ewig (Befund 17.10.2026).
export function neigungBestimmen(hand: number | null, m: NeigungMessung | undefined, hoehenDa: boolean): NeigungStand {
  const vorgabe = m?.i ?? 0
  const gemessen = m !== undefined && m.i !== null
  const vorgabeQuelle = gemessen ? m!.quelle : m ? `${m.quelle}: 0 % angenommen` : hoehenDa ? 'ohne Profil: 0 % angenommen' :
    'Höhenmodell lädt: vorerst 0 %'
  if (hand !== null) return { i: hand, vorgabe, hand: true, quelle: 'von Hand', vorgabeQuelle, gemessen, hinweis: null }
  return { i: vorgabe, vorgabe, hand: false, quelle: vorgabeQuelle, vorgabeQuelle, gemessen, hinweis: m?.hinweis ?? null }
}

/** nurRv: nur für «alle Arme» (E3c): ohne Massnahmen, Trottoir und ohne die Rechnung der übrigen Arme */
function rechneZufahrt(k: Kontext, info: KnotenInfo, zArm: ArmInfo, vorgeschlagen: boolean, eg: SichtEingaben, ke: Required<KnotenEingaben>,
  avRadius: number, hg: HindernisEingaben, avZentrum: P, g: GrundstueckGeo | null, hoehen: HoehenVorgabe | null,
  tempoAmtlich: TempoAmtlichDaten | null, nurRv = false): Ergebnis {
  const { netz, achsen, fahrbahn } = k
  // K0: Trottoirüberfahrt über diese Einmündung (nicht in der Rechnung «alle Arme»)
  const tue = !!ke.trottoirueberfahrt && !nurRv
  const amtlich = tempoAmtlich?.linien.length ? tempoAmtlich : null
  const kp = info.p
  const annahmen: string[] = [], hinweise: string[] = []
  const zName = g ? (g.weg !== null ? `${zArm.name || 'Zufahrt'} (OSM-Weg ${g.weg}, service)` : 'Grundstückzufahrt') : zArm.name || zArm.hw
  const istWeg = (wid: number) => wid >= 0 && netz.W.has(wid)
  if (g) hinweise.push(...g.hinweise)
  // Zufahrt: OSM-Linie des Arms, im Mündungsbereich geglättet (muendungGeglaettet), damit D und F_B nicht an Knickstücken hängen
  const zMl = g ? g.zMl(ZUF_LAENGE_M) : muendungGeglaettet(armMittellinie(netz, achsen, zArm, ZUF_LAENGE_M))

  // Vortrittsstrasse
  let paar: [ArmInfo, ArmInfo], grund: string, durchgehend = false
  if (g) { paar = g.arme; grund = g.grund }
  else if (info.vortritt && !info.vortritt.includes(zArm.key)) {
    paar = info.vortritt.map(key => info.arme.find(a => a.key === key)!) as [ArmInfo, ArmInfo]
    grund = info.vortrittGrund
  } else {
    const vp = vortrittPaar(info.arme, zArm.key)!
    paar = vp[0]; grund = vp[1]
    durchgehend = true
  }
  // Vortrittsregelung (E2b): Eingabe, sonst Vorgabe aus OSM highway=stop/give_way an der Zufahrt
  const anZufahrt = (s: VortrittsHinweis) => istWeg(zArm.wid) ? signalAnArm(netz, zArm, s) :
    zMl.slice(0, -1).some((q, i) => dist(q, kp) <= 30 && abstandStrecke(s.p, q, zMl[i + 1]) <= SIGNAL_ZUFAHRT_M)
  const signaleZ = info.signale.filter(anZufahrt)
  const strasseTags = paar.map(a => a.wid).filter(istWeg).map(wid => ({ hw: netz.w(wid).hw, t: netz.w(wid).t, tempo: wegTempo(netz, wid)?.[0] ?? null }))
  const [rVorgabe, rQuelle] = regelungVorgabe(signaleZ, strasseTags, !!g, tue)
  // Trottoirüberfahrt: Rechtsvortritt gilt nicht (VSS 40 242 Ziffer 12.3, VRV Art. 15 Abs. 3), gerechnet wie Vortritt
  const regelung: Regelung = tue && ke.regelung === 'rechtsvortritt' ? 'vortritt' : ke.regelung ?? rVorgabe
  if (tue && ke.regelung === 'rechtsvortritt')
    hinweise.push('Rechtsvortritt an einer Trottoirüberfahrt: gilt nicht (wer über das Trottoir einfährt, ist vortrittsbelastet; VSS 40 242 ' +
      'Ziffer 12.3, VRV Art. 15 Abs. 3); gerechnet wie «Vortritt».')
  if (ke.regelung === null)
    annahmen.push(`Vortrittsregelung «${REGELUNG_TEXT[regelung]}» angenommen (${rQuelle}; im Panel wählbar` +
      `${rVorgabe === 'rechtsvortritt' ? '; ohne Signal gilt Rechtsvortritt nach SVG Art. 36 Abs. 2, in Tempo-30-Zonen die Regel' : ''}).`)
  for (const s of info.signale) {
    const art = s.art === 'stop' ? 'Stop' : 'Kein Vortritt'
    if (!signaleZ.includes(s)) hinweise.push(`OSM: Signal «${art}» (highway=${s.art}) an einem anderen Arm des Knotens: Vortrittsstrasse prüfen.`)
    else if (ke.regelung !== null && ke.regelung !== rVorgabe)
      hinweise.push(`OSM: Signal «${art}» (highway=${s.art}) an der Zufahrt; gewählt ist «${REGELUNG_TEXT[regelung]}».`)
  }
  // Rechtsvortritt (E3c, Teil E): an einer Grundstückzufahrt gilt er nicht (wer über ein Trottoir bzw. aus einer Ausfahrt einfährt,
  // ist vortrittsbelastet); am Knoten die Arme links und rechts der Zufahrt
  if (regelung === 'rechtsvortritt' && g)
    hinweise.push('Rechtsvortritt an einer Grundstückzufahrt: gilt nicht (aus einer Ausfahrt bzw. über ein Trottoir ist man ' +
      'vortrittsbelastet, VRV Art. 15 Abs. 3); gerechnet wie «Vortritt».')
  const rv = regelung === 'rechtsvortritt' && !g
  const rArm = rv ? rechterArm(zArm, info.arme) : null
  const lArm = rv ? linkerArm(zArm, info.arme, rArm) : null
  const wahr: Wahrnehmbarkeit = ke.wahrnehmbarkeit ?? WAHRNEHMBARKEIT_VORGABE
  if (rv && rArm && lArm) {
    paar = [lArm, rArm]
    grund = 'Rechtsvortritt: Arme links und rechts der Zufahrt'
  }
  if (!rv) {
    if (durchgehend) hinweise.push('Die gewählte Zufahrt gehört nach OSM zur durchgehenden Strasse; als vortrittsberechtigt gelten hier ' +
      'die übrigen Arme. Vortrittsregelung vor Ort prüfen.')
    annahmen.push(`Vortrittsberechtigt: ${paar.map(armText).join(' und ')} (${grund}).`)
    if (vorgeschlagen) annahmen.push(`Zufahrt ${armText(zArm)} vorgeschlagen: einziger Arm ausserhalb der Vortrittsstrasse.`)
  } else {
    annahmen.push(rArm ? `Rechtsvortritt: Vortritt vor der Zufahrt hat der Arm rechts davon, ${armText(rArm)}, ` +
      `als rechts gilt ein Arm mehr als ${RECHTS_MIN_GRAD}° rechts der Fahrtrichtung; alle Arme sind vortrittsbelastet ` +
      '(VSS 40 273 Ziffer 15).' : `Rechtsvortritt: kein Arm liegt mehr als ${RECHTS_MIN_GRAD}° rechts der Fahrtrichtung, kein Verkehr hat ` +
      'Vortritt vor dieser Zufahrt.')
    const weitere = rechteArme(zArm, info.arme).slice(1)
    if (weitere.length) hinweise.push(`Rechtsvortritt: rechts der Zufahrt liegen weitere Arme (${weitere.map(armText).join(', ')}); ` +
      'geprüft wird nur der nächste rechts, die übrigen vor Ort prüfen.')
    if (ke.haltelinie) hinweise.push('Rechtsvortritt mit Haltelinie: B ab ihrer Vorderkante gerechnet; an Knoten mit Rechtsvortritt gibt ' +
      'es in der Regel keine Haltelinie (Abb. 4).')
  }
  // Zufahrt mit Einbahn vom Knoten weg und Velo gegen die Einbahn (E4): vortrittsbelastet sind nur die Velos; D auf ihrer Achse, F_B
  // als Velo (auch beim Rechtsvortritt: die Velos gewähren dem Verkehr von rechts den Vortritt; nicht an einer Grundstückzufahrt)
  const zVeloGegen = !zArm.zufluss && zArm.veloZufluss && !g ? zArm.veloZuflussQuelle : null
  if (!zArm.zufluss) hinweise.push(zVeloGegen ? `Die Zufahrt ist eine Einbahn vom Knoten weg; vortrittsbelastet sind nur die Velos im ` +
    `Gegenverkehr (OSM ${zVeloGegen})${rv ? ': Prüfung nach Teil E von ihrem Beobachtungspunkt aus' : ''}.` : rv ? 'Die Zufahrt ist ' +
    'nach OSM eine Einbahn vom Knoten weg: kein vortrittsbelasteter Verkehr, keine Prüfung nach Teil E.' :
    'Die Zufahrt ist nach OSM eine Einbahn vom Knoten weg: kein vortrittsbelasteter Verkehr. Gerechnet wird trotzdem.')

  // links und rechts aus Sicht des wartenden Fahrzeugs (Fahrt zum Knoten: −u der Zufahrt)
  const fahrt = neg(zArm.richtung)
  const [aL, aR] = rv && rArm && lArm ? [lArm, rArm] :
    drehung(fahrt, paar[0].richtung) >= drehung(fahrt, paar[1].richtung) ? paar : [paar[1], paar[0]]
  // Lage (lage.ts): ein Arm höchstens GEGENUEBER_GRAD neben der Geradeausrichtung liegt gegenüber (Gegenverkehr, Zufahrt auf der
  // durchgehenden Strasse); höchstens einer, der nähere. Beim Rechtsvortritt bleibt der Arm rechts (mehr als RECHTS_MIN_GRAD rechts der
  // Fahrt) «rechts»; an einer Grundstückzufahrt liegt nie ein Arm gegenüber. richtung bleibt der Schlüssel, die Lage nur Beschriftung
  const lageLR: [Lage, Lage] = ['links', 'rechts']
  if (!g) {
    const w = [aL, aR].map(a => geradeausWinkel(fahrt, a.richtung))
    const j = w[0] <= w[1] ? 0 : 1
    if (!(rv && rArm && j === 1)) lageLR[j] = lageVon(fahrt, [aL, aR][j].richtung, j === 0 ? 'links' : 'rechts')
  }
  const gegenArm = lageLR[0] === 'gegenueber' ? aL : lageLR[1] === 'gegenueber' ? aR : null
  if (!rv && gegenArm) hinweise.push(`Die Zufahrt liegt auf der durchgehenden Strasse; die Sicht zum Gegenverkehr (${armText(gegenArm)}) ` +
    'zählt nur beim Linksabbiegen (Ziffer 1: Zufahrt aus einer einmündenden Strasse).')
  // die Seite des Arms gegenüber: liegt dort kein Arm des Knotens (mehr als GEGENUEBER_GRAD neben der Geradeausrichtung)?
  const gegenSeite: Richtung | null = lageLR[0] === 'gegenueber' ? 'links' : lageLR[1] === 'gegenueber' ? 'rechts' : null
  const seiteOhneArm = gegenSeite && !info.arme.some(a => a.key !== zArm.key && geradeausWinkel(fahrt, a.richtung) > GEGENUEBER_GRAD &&
    (drehung(fahrt, a.richtung) > 0) === (gegenSeite === 'links')) ? gegenSeite : null
  // spitzer Winkel: beide Arme auf einer Seite (ein Arm gegenüber zählt nicht)
  if (!rv && ((lageLR[0] === 'links' && drehung(fahrt, aL.richtung) <= 0) || (lageLR[1] === 'rechts' && drehung(fahrt, aR.richtung) >= 0)))
    hinweise.push('Die Arme der Vortrittsstrasse liegen nicht beidseits der Zufahrt (spitzer Winkel): Seiten links/rechts prüfen.')
  if ([zArm, aL, aR].some(a => istWeg(a.wid) && netz.w(a.wid).ring))
    hinweise.push('Kreisverkehr: nicht Gegenstand der VSS 40 273 (Ziffer 1, Verweis auf VSS 40 263); Ergebnis nur zur Orientierung.')
  // Einbiegewinkel: Zufahrt gegen die Richtung der Vortrittsstrasse (Sehne von rechts nach links)
  // Rechtsvortritt: Winkel zwischen Zufahrt und rechtem Arm (ohne rechten Arm ohne Bedeutung: 90° gesetzt)
  const einbiegewinkel = rv ? (rArm ? wdiff(zArm.richtung, rArm.richtung) : 90) : wdiff(zArm.richtung, sub(aL.richtung, aR.richtung))
  if (einbiegewinkel < SCHIEF_UNTER || einbiegewinkel > 180 - SCHIEF_UNTER)
    annahmen.push(`Einbiegewinkel rund ${Math.round(einbiegewinkel)}°: B entlang der Zufahrtsachse gemessen, der senkrechte Abstand von D ` +
      'zur Kante ist kleiner als B.')

  // Mittellinien und Querschnitte der vortrittsberechtigten Arme
  const haupt = [aL, aR].map(a => {
    const ml = g ? g.mittellinie(a, ARM_LAENGE_M) : armMittellinie(netz, achsen, a, ARM_LAENGE_M)
    return { arm: a, ml, qs: querschnitt(netz, fahrbahn, ml, a.wid) }
  })
  // nächstliegender Rand (Seite der Zufahrt) je Arm, zusammengesetzt durch den Knoten
  const randTeile = haupt.map(h => {
    const zufahrtLinks = kreuz(h.arm.richtung, zArm.richtung) > 0
    const versatz = zufahrtLinks ? h.qs.links : -h.qs.rechts
    return { linie: versetzt(abschneiden(h.ml, RAND_LAENGE_M), versatz), abstand: Math.abs(versatz) }
  })
  // Rechtsvortritt: B ab dem Rand des rechten Arms auf der Seite der Zufahrt (Abb. 4), über den Knoten hinaus verlängert
  const rvRand = rv && rArm ? mitVerlaengerung(randTeile[1].linie, RAND_LAENGE_M) : null
  const rand = rvRand ?? [...[...randTeile[0].linie].reverse(), ...randTeile[1].linie]
  const nah = rvRand ? randTeile[1].abstand : Math.max(randTeile[0].abstand, randTeile[1].abstand)
  // Veloführung je Richtung (E3b): Eingabe, sonst Vorgabe aus OSM (Tags des Arms, Radweg daneben)
  const veloStand = haupt.map((h, j): VeloStand => {
    const r: Richtung = j === 0 ? 'links' : 'rechts'
    const rw = radwegNeben(h.ml, h.qs.links, h.qs.rechts, k.radwege)
    const [vorgabe, quelle] = veloVorgabe(istWeg(h.arm.wid) ? netz.w(h.arm.wid).t : {}, h.arm.hw, h.arm.sd > 0, rw,
      !h.arm.zufluss && h.arm.veloZufluss ? h.arm.veloZuflussQuelle : null)
    const fuehrung = ke.velo[r] ?? vorgabe
    // Radweg ohne OSM-Linie (cycleway=track bzw. von Hand gewählt): RADWEG_BREITE_M direkt am Fahrbahnrand angenommen
    const radweg: RadwegLage | null = fuehrung !== 'radweg' ? null : rw ?? { id: 0, versatz: h.qs.links + RADWEG_BREITE_M / 2,
      breite: RADWEG_BREITE_M, breiteOsm: false, abstand: 0, zweiRichtungen: false, eigeneSeite: true, treffer: 0 }
    return { fuehrung, vorgabe, quelle, gewaehlt: ke.velo[r] !== null, radweg, radwegOsm: rw }
  })
  // Ziffer 12: Radweg zwischen Zufahrt und Fahrbahn näher als RADWEG_NAH_M am Rand: B ab seiner Aussenkante. Es zählt die Lage des
  // Radwegs (aus OSM auch bei anderer Veloführung; ohne OSM-Linie nur der von Hand bzw. aus cycleway=track angenommene); zwischen
  // Zufahrt und Fahrbahn heisst auf der Seite der Zufahrt (versatz > 0 = links von u)
  const radwegNah = veloStand.map((v, j) => {
    const x = v.radwegOsm ?? (v.fuehrung === 'radweg' ? v.radweg : null)
    const zl = kreuz(haupt[j].arm.richtung, zArm.richtung) > 0
    return x && (x.versatz > 0) === zl && x.abstand < RADWEG_NAH_M - RADWEG_TOL_M ? x : null
  })
  const radwegAussen = Math.max(0, ...radwegNah.map(x => (x ? x.abstand + x.breite : 0)))
  const radwegMass = radwegNah.find(x => x && x.abstand + x.breite === radwegAussen) ?? null
  for (const [j, x] of radwegNah.entries())
    if (x && x.id && veloStand[j].fuehrung !== 'radweg')
      hinweise.push(`Radweg in OSM (Weg ${x.id}) ${f1(x.abstand)} m neben dem Fahrbahnrand an der Zufahrt: B ab seiner Aussenkante ` +
        `(Ziffer 12), obwohl ${lageNach({ lage: lageLR[j] })} «${VELOFUEHRUNG_TEXT[veloStand[j].fuehrung]}» gilt.`)
  let radwegRandLinie: P[] | null = null
  if (radwegAussen > 0) {
    const teile = haupt.map(h => {
      const zl = kreuz(h.arm.richtung, zArm.richtung) > 0
      return versetzt(abschneiden(h.ml, RAND_LAENGE_M), zl ? h.qs.links + radwegAussen : -(h.qs.rechts + radwegAussen))
    })
    radwegRandLinie = [...[...teile[0]].reverse(), ...teile[1]]
  }

  // Achse des Zufahrtsstreifens: AV-Querschnitt der Zufahrt (fahrstreifenmitte) ausserhalb der Vortrittsstrasse, sonst OSM
  // Hindernisse (E2a): zählende Hindernisse; Auto-Parkfelder und Längsparkierung auch für den Parkstreifen an den Achsen
  const zaehlend = zaehlendeHindernisse(hg)
  const park = new HindernisDaten(zaehlend).park
  let zLage: number, zQuelle: string
  let zufahrtVelo: Ergebnis['zufahrtVelo'] = null
  if (g) {
    // Grundstückzufahrt: Achse = Linie der Zufahrt (Mitte, einspurig angenommen), ohne Parkstreifen
    zLage = 0
    zQuelle = g.weg !== null ? `Achse der Zufahrt entlang des OSM-Wegs ${g.weg} (service), Mitte der Zufahrt, einspurig angenommen` :
      `Achse der Grundstückzufahrt: Linie durch den Zufahrtspunkt, ${g.gezeichnet ? 'Richtung gezeichnet' : 'senkrecht zum Rand'}, ` +
      'Mitte der Zufahrt, einspurig angenommen'
    annahmen.push(zQuelle + '.')
  } else {
  const ab: number[] = []
  for (let s = nah + ZUF_VON_M; s <= nah + ZUF_BIS_M + 1e-9; s += ZUF_SCHRITT_M) ab.push(s)
  const ref = punkteAufSpur(zMl, ab).map(([q, t]) => [q, links(t)] as [P, P])       // rechts des Fahrers = links von u
  const art = zArm.einbahn !== 0 ? 'einbahn' : 'beide'
  // Parkstreifen rechts bzw. links auf der Zufahrt: Prüfpunkte PARK_SONDE_M innerhalb der Ränder (je Sehne); als Abzug an
  // fahrstreifenmitte (wie Parkierung aus OSM-Tags, gleich an allen Messpunkten)
  const sondenR: P[] = [], sondenL: P[] = []
  for (const [q, r] of ref) {
    const sh = fahrbahn.sehne(q, r)
    if (!sh) continue
    sondenR.push(add(q, r, sh[0] - PARK_SONDE_M)); sondenL.push(add(q, r, -(sh[1] - PARK_SONDE_M)))
  }
  const zParkR = parkStreifen(sondenR, park), zParkL = parkStreifen(sondenL, park)
  const zAbzug: AbzugQuelle | null = zParkR.abzug || zParkL.abzug ?
    () => ({ r: { park: zParkR.abzug, velo: 0 }, l: { park: zParkL.abzug, velo: 0 } }) : null
  const fs = fahrstreifenmitte(ref, art, fahrbahn, zAbzug, 0)
  if (fs) {
    zLage = fs.lage
    const pz = [zParkR.abzug ? parkStreifenText(zParkR) : '', fs.abzugParkL ? parkStreifenText(zParkL).replace('rechts', 'links') : '']
      .filter(x => x)
    zQuelle = `Achse des Zufahrtsstreifens aus dem AV-Querschnitt der Zufahrt (Fahrbahn ${f1(fs.breite)} m, ` +
      `${art === 'einbahn' ? 'Einbahn, Mitte' : 'Mitte der rechten Hälfte'}, ${fs.nSehnen} Sehnen` +
      `${pz.length ? `; ${pz.join('; ')}` : ''})`
    if (pz.length) annahmen.push(`Parkstreifen auf der Zufahrt: ${pz.join('; ')}; Achse des Zufahrtsstreifens, D und FB entsprechend verschoben.`)
  } else {
    const [l0, , q] = lageOsm(netz, zArm.wid, LAGE_ERSATZ)
    zLage = l0 ?? LAGE_ERSATZ
    zQuelle = `Achse des Zufahrtsstreifens ohne AV-Querschnitt: ${q === 'Annahme' ? `${f2(LAGE_ERSATZ)} m rechts der OSM-Achse angenommen` :
      `aus OSM (${q})`}`
    annahmen.push(zQuelle + '.')
  }
  if (zVeloGegen) {
    // Velo gegen die Einbahn (E4): Achse am für das Velo rechten Rand (aus Sicht des Autoverkehrs dem linken), wie velo.ts: Mischverkehr
    // D_VELO_M vom Rand, Gegenverkehrsstreifen in seiner Mitte, Radweg auf seiner Achse (ohne OSM-Linie direkt am Rand angenommen)
    const rwZ = fs ? radwegNeben(zMl, fs.rechts, fs.links, k.radwege) : null
    const [f0, fQuelle] = veloVorgabe(netz.w(zArm.wid).t, zArm.hw, zArm.sd > 0, rwZ?.eigeneSeite ? rwZ : null, zVeloGegen)
    const fuehrung: Exclude<Velofuehrung, 'kein'> = f0 === 'kein' ? 'misch' : f0
    let lageText: string
    if (fs) {
      const randV = fs.rechts - fs.abzugParkR
      zLage = fuehrung === 'misch' ? randV - D_VELO_M : fuehrung === 'radstreifen' ? randV - RADSTREIFEN_M / 2 :
        rwZ?.eigeneSeite ? rwZ.versatz : fs.rechts + RADWEG_BREITE_M / 2
      lageText = fuehrung === 'misch' ? `${f2(D_VELO_M)} m vom für das Velo rechten Fahrbahnrand${fs.abzugParkR ? ' neben dem Parkstreifen' : ''} ` +
        '(Mischverkehr)' : fuehrung === 'radstreifen' ? `Mitte des Gegenverkehrsstreifens, ${f2(fs.abzugParkR + RADSTREIFEN_M / 2)} m vom ` +
        'für das Velo rechten Fahrbahnrand' : rwZ?.eigeneSeite ? `Achse des Radwegs (OSM-Weg ${rwZ.id})` :
        `Achse des Radwegs ohne OSM-Linie, ${f2(RADWEG_BREITE_M)} m breit direkt am Fahrbahnrand angenommen`
      zQuelle = `Achse des Velogegenverkehrs auf der Zufahrt: ${lageText}, aus Sicht des Autoverkehrs am linken Fahrbahnrand (AV-Querschnitt ` +
        `der Zufahrt, Fahrbahn ${f1(fs.breite)} m, ${fs.nSehnen} Sehnen)`
    } else {
      lageText = 'ohne AV-Querschnitt: auf der Achse des Zufahrtsstreifens angenommen'
      zQuelle += '; Velogegenverkehr ohne AV-Querschnitt auf dieser Achse angenommen'
    }
    zufahrtVelo = { quelle: zVeloGegen, fuehrung, fuehrungQuelle: fQuelle, lageText }
    annahmen.push(`Zufahrt mit Velo gegen die Einbahn (OSM ${zVeloGegen}): F_B ist ein Velo im Gegenverkehr, ${VELOFUEHRUNG_TEXT[fuehrung]} ` +
      `(${fQuelle}); D auf seiner Achse (${lageText}), am für das Velo rechten, aus Sicht des Autoverkehrs linken Fahrbahnrand; B ab der ` +
      'Kante wie für Motorfahrzeuge.')
  }
  }
  const zAchse = mitVerlaengerung(versetzt(zMl, zLage))

  // B und D
  const ao = istAusserorts(netz, [aL.wid, aR.wid])
  const stop = regelung === 'stop'
  const B = rv ? RV_B_M : beobachtungsdistanz(ao.ausserorts, stop)
  // ohne Schnitt mit dem Rand: Rand im Abstand nah vom Knoten (Verlängerung plus halbe Fahrbahn auf der Zufahrtsachse)
  // D am Fahrersitz links der Achse; ein Velo (E4, Velo gegen die Einbahn) auf der Achse
  const dSeitlich = zufahrtVelo ? 0 : FAHRERSITZ_M
  const beob = beobachtungspunkt(zAchse, rand, B, kp, VERLAENGERUNG_M + nah, dSeitlich)
  if (!beob.randGefunden) hinweise.push('Die Zufahrtsachse schneidet den Rand der Vortrittsstrasse nicht: Rand im Abstand der halben Fahrbahn angenommen.')
  // Trottoir zwischen Zufahrt und Vortrittsstrasse (AV): F_B wartet vor dem Trottoir, ausser es ist frei von Hindernissen
  const tr = trottoirAnZufahrt(zAchse, beob.sRand, p => k.trottoir.art(p) !== null)
  const trAt = 'sHinter' in tr ? tr : null
  const trottoir: TrottoirErgebnis | null = trAt ? { breite: trAt.breite, frei: ke.trottoirFrei,
    hinterkante: beobachtungAb(zAchse, trAt.sHinter, 0).nullpunkt } : null
  // AV-Trottoir neben den Armen (velo.trottoirNeben): für die Trottoirachse (E3b) bzw. die Trottoirüberfahrt (K0)
  const lagenT = (trAt || tue) && !nurRv ? haupt.map(h => {
    const zl = kreuz(h.arm.richtung, zArm.richtung) > 0
    return { h, seite: (zl ? 1 : -1) as 1 | -1, rand: zl ? h.qs.links : h.qs.rechts,
      t: trottoirNeben(h.ml, zl ? 1 : -1, zl ? h.qs.links : h.qs.rechts, p => k.trottoir.art(p) !== null) }
  }) : null
  // Trottoirüberfahrt (K0): Band zwischen Bordkante und hinterem Rand; F_B wartet für die Phase Fahrbahn an der Bordkante
  const tueEingabe = ke.trottoirueberfahrt?.breite ?? null
  const tueB: TueBand | null = tue ? tueBand(beob.sRand, lagenT!.map(l => ({ ml: l.h.ml, seite: l.seite, rand: l.rand, t: l.t })) as
    [Parameters<typeof tueBand>[1][0], Parameters<typeof tueBand>[1][1]], trAt,
    tueEingabe !== null && tueEingabe >= TUE_BREITE_MIN && tueEingabe <= TUE_BREITE_MAX ? tueEingabe : null, einbiegewinkel) : null
  if (tueB) hinweise.push(...tueB.hinweise)
  const sKante = trAt && !ke.trottoirFrei && !tue ? trAt.sHinter : beob.sRand
  let xRadweg = radwegRandLinie ? schnittBei(zAchse, radwegRandLinie, kp) : null
  if (radwegRandLinie && !xRadweg) hinweise.push('Die Zufahrtsachse schneidet die Aussenkante des Radwegs nicht: B ab der Kante bzw. Trottoirhinterkante.')
  // Radweg aus OSM: nur, wenn seine Linie an der Zufahrt liegt (endet er vorher, keine Verlängerung)
  const rwLinie = radwegMass?.id ? k.radwege.find(w => w.id === radwegMass.id)?.linie ?? null : null
  if (xRadweg && rwLinie && Math.min(...rwLinie.slice(0, -1).map((q, i) => abstandStrecke(xRadweg!.p, q, rwLinie[i + 1]))) >
    radwegMass!.breite / 2 + RADWEG_AN_ZUFAHRT_M) {
    hinweise.push(`Der Radweg (OSM-Weg ${radwegMass!.id}) reicht nicht bis an die Zufahrt: B ab der Kante bzw. Trottoirhinterkante.`)
    xRadweg = null
  }
  const abRadweg = !!xRadweg && xRadweg.sa > sKante + 0.005
  const sNormal = abRadweg ? xRadweg!.sa : sKante
  // Haltelinie (E2b): Lot auf die Zufahrtsachse; B ab ihrer Vorderkante (Ziffer 5)
  let haltelinie: HaltelinieErgebnis | null = null
  if (ke.haltelinie) {
    const l = lageAnAchse(zAchse, ke.haltelinie)
    const abstand = l.s - beob.sRand
    if (Math.abs(l.seitlich) > HALTELINIE_SEITLICH_M)
      hinweise.push(`Haltelinie ${f1(Math.abs(l.seitlich))} m neben der Zufahrtsachse: nicht gerechnet (höchstens ${HALTELINIE_SEITLICH_M} m).`)
    else if (abstand < -HALTELINIE_VOR_M || abstand > HALTELINIE_HINTER_M)
      hinweise.push(`Haltelinie ${f1(Math.abs(abstand))} m ${abstand < 0 ? 'vor' : 'hinter'} der Kante: nicht gerechnet (zulässig ` +
        `${HALTELINIE_VOR_M} m davor bis ${HALTELINIE_HINTER_M} m dahinter).`)
    else {
      const vorverlegt = l.s < sNormal - 0.05
      haltelinie = { p: l.fuss, quer: querlinie(l.fuss, l.t, HALTELINIE_HALB_M), abstand, vorverlegt }
      if (vorverlegt)
        hinweise.push(`Haltelinie ${f2(sNormal - l.s)} m vor ${abRadweg ? 'der Aussenkante des Radwegs' : trAt && !ke.trottoirFrei && !tue ?
          'der Trottoirhinterkante' : 'der Kante des Fahrstreifens mit Vortritt'} (vorverlegt): Ausnahme nach VSS 40 273 Ziffer 14, nur an bestehenden ` +
          'Knoten und Zufahrten und mit begleitenden Markierungen.')
    }
  }
  const sNull = haltelinie ? beob.sRand + haltelinie.abstand : sNormal
  const nullpunktText = haltelinie ? 'Vorderkante der Haltelinie' : abRadweg ? 'Aussenkante des Radwegs' :
    tue ? 'Bordkante (vorderer Rand der Trottoirüberfahrt)' : trAt && !ke.trottoirFrei ? 'Trottoirhinterkante' :
    trAt ? 'Bordkante (Trottoir ohne Hindernisse)' : 'Kante des Fahrstreifens mit Vortritt'
  const vorgabe = beobachtungAb(zAchse, sNull, B, dSeitlich)
  const ausserText = rv ? 'Rechtsvortritt, Abb. 4' : ao.ausserorts ? (stop ? 'ausserorts, Stop' : 'ausserorts') : 'innerorts'
  // D von Hand (E2b): frei gesetzt; F_B folgt (Fahrzeugachse um den Fahrersitz nach rechts)
  let D = vorgabe.D, Dachse = vorgabe.Dachse, fbRichtung = neg(vorgabe.t)
  let Dlage = { laengs: B, seitlich: dSeitlich }
  if (ke.D) {
    const l = lageAnAchse(zAchse, ke.D)
    D = ke.D; Dachse = add(ke.D, links(l.t), dSeitlich); fbRichtung = neg(l.t)
    Dlage = { laengs: l.s - sNull, seitlich: l.seitlich }
    if (Dlage.laengs < B_INNERORTS_M - 0.005)
      hinweise.push(`D von Hand ${f2(Dlage.laengs)} m hinter der ${nullpunktText}: weniger als ${f2(B_INNERORTS_M)} m (Ziffer 12; Ausnahmen ` +
        'nur an bestehenden Knoten und Zufahrten, Ziffer 14).')
    else if (Dlage.laengs < B - 0.005)
      hinweise.push(`D von Hand ${f2(Dlage.laengs)} m hinter der ${nullpunktText}: weniger als B = ${f2(B)} m (${ausserText}, Ziffer 12).`)
    if (dist(ke.D, vorgabe.nullpunkt) > D_HAND_WEIT_M)
      hinweise.push(`D von Hand liegt ${Math.round(dist(ke.D, vorgabe.nullpunkt))} m vom Nullpunkt entfernt: Lage prüfen.`)
  } else {
    annahmen.push(rv ? `Beobachtungsdistanz B = ${f2(B)} m (Rechtsvortritt, VSS 40 273 Ziffer 16, Abb. 4), entlang der Achse des ` +
      `Zufahrtsstreifens ab der ${nullpunktText}${rArm ? ` (Rand des rechten Arms ${armText(rArm)})` : ''}.` :
      `Beobachtungsdistanz B = ${f2(B)} m (${ausserText} nach ${ao.grund}; VSS 40 273 Ziffer 12), ` +
      `entlang der Achse des Zufahrtsstreifens ab der ${nullpunktText}.`)
    annahmen.push(zufahrtVelo ? 'Beobachtungspunkt D auf der Achse des Velogegenverkehrs (Velofahrer über der Achse).' :
      `Beobachtungspunkt D am Fahrersitz: ${f2(FAHRERSITZ_M)} m links der Achse des Zufahrtsstreifens.`)
  }
  if (trAt && !ke.trottoirFrei && !haltelinie && !ke.D && !tue)
    annahmen.push(`Trottoir zwischen Zufahrt und Vortrittsstrasse (AV, ${f1(trAt.breite)} m entlang der Zufahrtsachse): F_B wartet vor dem ` +
      'Trottoir, B ab der Trottoirhinterkante; steht auf dem Trottoir nichts im Weg, im Panel das Häkchen «Trottoir ohne Hindernisse» setzen ' +
      '(Ziffer 13.1).')
  if (abRadweg && !haltelinie && !ke.D) {
    const rw = radwegMass!
    annahmen.push(`Radweg ${f1(rw.abstand)} m neben dem Fahrbahnrand, näher als ${f2(RADWEG_NAH_M)} m (Ziffer 12, Abb. 2): B ab der ` +
      `Aussenkante des Radwegs (Breite ${f2(rw.breite)} m${rw.breiteOsm ? ' aus OSM width' : ', angenommen'}), F_B wartet vor dem Radweg.`)
  }
  const trottoirGrund = trAt ? '' : (tr as { grund: string }).grund
  if (rv && trAt) hinweise.push('Rechtsvortritt mit Trottoir quer über die Zufahrt (Trottoirüberfahrt): wer über ein Trottoir einfährt, ist ' +
    'vortrittsbelastet (VRV Art. 15 Abs. 3); Vortrittsregelung prüfen.')
  if (ke.trottoirFrei && !trAt && !tue) hinweise.push(`Häkchen «Trottoir ohne Hindernisse» ohne Wirkung: ${trottoirGrund}.`)
  if (k.gebaeude.some(x => imPolygon(D, x.poly))) hinweise.push('D liegt in einem Gebäude der AV: Daten bzw. Lage der Zufahrt prüfen.')
  const qsAnnahmen = haupt.filter(h => h.qs.annahme).map(h => `${armText(h.arm)}: ${h.qs.quelle}`)
  annahmen.push(...qsAnnahmen.map(x => `Querschnitt ${x}.`))
  // Strassentyp und ungünstige Verhältnisse (E1)
  const ns: Record<Richtung, NeigungStand> = { links: neigungBestimmen(eg.neigung.links, hoehen?.links, !!hoehen),
    rechts: neigungBestimmen(eg.neigung.rechts, hoehen?.rechts, !!hoehen) }
  const strasse = strasseBestimmen(netz, [aL, aR], eg, { links: ns.links.i, rechts: ns.rechts.i })
  if (!strasse.typGewaehlt && !rv)
    annahmen.push(`Strassentyp «${STRASSENTYP_TEXT[strasse.typ]}» aus ${strasse.typQuelle} angenommen (Vorgabe: trunk, primary, secondary, ` +
      `tertiary und deren links = Hauptverkehrsstrasse, sonst Erschliessungsstrasse; im Panel wählbar): ${strasse.typ === 'es' ?
      'unterer Wert der Tab. 1 massgebend.' : 'Zwischenwert der Tab. 1 massgebend (Mittel von unterem und oberem Wert, auf ganze Meter aufgerundet).'}`)
  if (eg.fahrstreifen === null && strasse.ungunst.fahrstreifen && !rv)
    annahmen.push(`Mehr als zwei Fahrstreifen aus ${strasse.fahrstreifenQuelle} angenommen (ungünstige Verhältnisse).`)
  if (eg.neigungGross === null && strasse.ungunst.neigung && !rv)
    annahmen.push(`Grosse Längsneigung angenommen (|i| über ${NEIGUNG_GROSS_PROZENT} % in einer Richtung; ungünstige Verhältnisse).`)
  const ung = strasse.ungunst.fahrstreifen || strasse.ungunst.neigung || strasse.ungunst.schwerverkehr
  if (strasse.typ === 'es' && ung && !rv)
    hinweise.push('Ungünstige Verhältnisse an einer Erschliessungs-, Sammel- oder Verbindungsstrasse: der untere Wert bleibt massgebend; ' +
      'gilt die Strasse als Hauptverkehrsstrasse, hebt die Wahl im Panel auf den oberen Wert.')
  // 0 % ohne Messung (Höhenmodell nicht geladen bzw. Fehler, oder von Hand 0) als Annahme; gemessene Werte mit Quelle
  // Richtungen ohne Profil (nicht geprüft bzw. kein Verkehr; Profile geladen, aber für sie keines geholt) erscheinen hier nicht
  const ohneProfil = (r: Richtung) => !ns[r].hand && !!hoehen && hoehen[r] === undefined
  const eben = (['links', 'rechts'] as Richtung[]).filter(r => ns[r].i === 0 && !(ns[r].gemessen && !ns[r].hand) && !ohneProfil(r))
  const lageR = (r: Richtung) => ({ lage: lageLR[r === 'links' ? 0 : 1] })
  if (eben.length) annahmen.push(`Längsneigung ${eben.map(r => lageKurz(lageR(r))).join(' und ')} 0 % (eben; ${eben.some(r => !ns[r].hand) ?
    'ohne Messung aus dem Höhenmodell, ' : ''}im Panel je Richtung einzugeben).`)
  const gemessen = (['links', 'rechts'] as Richtung[]).filter(r => ns[r].gemessen && !ns[r].hand)
  if (gemessen.length) annahmen.push(`Längsneigung ${gemessen.map(r => `${lageKurz(lageR(r))} ${fi(ns[r].i)} %`).join(', ')} aus dem Höhenmodell ` +
    `swissALTI3D (swisstopo): Ausgleichsgerade über das Höhenprofil der Fahrstreifenachse ab K bis A massgebend (mindestens ` +
    `${PROFIL_MIN_M} m), in Fahrtrichtung, talwärts negativ; im Panel überschreibbar. Kuppen und Wannen nicht geprüft.`)
  if (!rv) annahmen.push(`Anhaltesichtweite nach VSS 40 090b Abb. 2 (übrige Strassen; aus dem Diagramm abgelesen, ±2 m; VP = Tempo der Tab. 1), ` +
    `Kurven bei 0 % auf den unteren Wert der Tab. 1 verschoben (aus Abb. 2 zählt nur die Wirkung der Neigung), ` +
    `als Untergrenze nur bei |i| über ${NEIGUNG_EBEN_PROZENT} % angewendet.`)
  // Hindernisse (E2a): in D liegende nicht rechnen (z. B. Parkierung entlang der Zufahrt an der Stelle des wartenden Fahrzeugs)
  const hvAlle = hindernisVerdeckend(zaehlend)
  const inD = hvAlle.filter(v => imPolygon(D, v.poly)).map(v => v.id)
  const hv = hvAlle.filter(v => !inD.includes(v.id))
  for (const id of inD) hinweise.push(`D liegt im Hindernis «${hvAlle.find(v => v.id === id)!.name}»: für die Sicht nicht gerechnet.`)
  annahmen.push(`Sichthindernisse: ${hv.length ? `Gebäude der AV und ${hv.length} Hindernisse (von Hand, bestätigte Vorschläge, ` +
    'amtliche Parkfelder)' : 'nur Gebäude der AV (keine Hindernisse eingegeben bzw. geladen)'}; ` +
    'Rechnung in der Ebene, Höhenbereich 0,60 bis 3,00 m nicht geprüft.')
  const hat = (f: (h: Hindernis) => boolean) => zaehlend.some(f)
  if (hat(h => h.art === 'parkfeld' || h.art === 'laengsparkierung'))
    annahmen.push('Parkfelder gelten als belegt: ein Personenwagen verdeckt die Sicht; Velo- und Motorrad-Parkfelder nur als Hinweis ' +
      'ohne Statuswirkung.')
  if (hat(h => h.art === 'baum'))
    annahmen.push(`Baum: Stamm ${f1(BAUM_STAMM_M)} m (Kreis), Krone über dem Sichtfeld; Palisade: Bäume zählen erst ab ` +
      `${f1(PALISADE_MIN_M)} m zusammenhängend verdeckter Strecke (eine Fahrzeuglänge) als Verdeckung, sonst Hinweis mit dem verdeckten Anteil.`)
  if (hat(h => h.art === 'hecke' || h.art === 'mauer' || h.art === 'zaun' || h.art === 'uebrige'))
    annahmen.push(`Höhe von Hecken, Mauern, Zäunen und übrigen Hindernissen nicht geprüft: sie verdecken nach Eingabe («sichtbehindernd» ` +
      `bzw. «dicht»); als Linie gezeichnete mit ${f1(LINIE_PUFFER_M)} m beidseits der Linie.`)

  const richtungen = ([['links', aL, haupt[0], veloStand[0], lageLR[0]], ['rechts', aR, haupt[1], veloStand[1], lageLR[1]]] as
    [Richtung, ArmInfo, typeof haupt[0], VeloStand, Lage][])
    .map(([r, a, h, v, lg]) => richtungRechnen(k, r, lg, a, h.ml, h.qs, zAchse, D, kp, strasse, ns[r], avRadius, hv, park, ke.tempo[r],
      amtlich, !rv ? null : !zArm.zufluss && !zVeloGegen ? { grund: 'Rechtsvortritt: die Zufahrt ist eine Einbahn vom Knoten weg, kein vortrittsbelasteter ' +
        'Verkehr; keine Prüfung' } : r === 'rechts' && rArm ? { wahr } :
        // Gegenverkehr wartet beim Geradeausfahren nicht (nur wer links abbiegt, lässt ihn durch); von links wartet der Verkehr
        { grund: !rArm ? 'Rechtsvortritt: kein Arm rechts der Zufahrt, kein Verkehr hat Vortritt vor dieser Zufahrt; keine Prüfung' :
          lg === 'gegenueber' ? `Gegenverkehr aus ${armText(a)}: kein Vortrittsverhältnis beim Geradeausfahren (Linksabbiegen nicht geprüft)` :
          `Verkehr von links (${armText(a)}) muss dieser Zufahrt den Vortritt lassen: nicht geprüft` },
      avZentrum, v, ke.ebikeVerboten))
  annahmen.push(`Fahrstreifenachse der vortrittsberechtigten Fahrzeuge ${f2(D_MFZ_M)} m vom rechten Fahrbahnrand (d, VSS 40 273 ` +
    `Ziffer 10), Rand aus der AV-Fahrbahn; bei einem Parkstreifen rechts ${f2(D_MFZ_M)} m neben dem Parkstreifen (Abzug ` +
    `${f2(PARKSTREIFEN)} m, wenn Prüfpunkte ${f2(PARK_SONDE_M)} m innerhalb des Rands, je 2 m bis zum Ende der Zielpunkte, auf ` +
    `Auto-Parkfeldern liegen: mindestens ${PARK_MIN_TREFFER} Treffer an 2 Feldern bzw. ${PARK_EIN_FELD_TREFFER} an einem Feld, ` +
    `Abstand höchstens ${f1(PARK_SONDE_RADIUS_M)} m): ${richtungen.map(r => `${lageNach(r)} ${parkStreifenText(r.parkStreifen)}`)
      .join(', ')}${richtungen.some(r => r.veloFuehrung === 'radstreifen') ? `; mit Radstreifen ${f2(D_MFZ_M)} m neben dem Radstreifen ` +
      `(Breite ${f2(RADSTREIFEN_M)} m angenommen, Abzug wie fgsCheck)` : ''}.`)
  // Rechtsvortritt (E3c): Ergebnis des gewählten Arms gegen den rechten, bei schmaler Zufahrt die Paarmatrix (Abb. 5)
  const flaechenRv = [...k.gebaeude, ...hv]
  let rvAchsen: [P[], P[]] | null = null
  let rechtsvortritt: RechtsvortrittErgebnis | null = null
  if (rv) {
    const rr = richtungen.find(r => r.richtung === 'rechts')!
    const breite = (q: Querschnitt) => (q.annahme ? null : q.links + q.rechts)
    const qsZ = g ? null : querschnitt(netz, fahrbahn, zMl, zArm.wid)
    const bZ = qsZ ? breite(qsZ) : null, bR = rArm ? breite(haupt[1].qs) : null
    const schmal = !!rArm && [bZ, bR].some(b => b !== null && b <= SCHMAL_M + 1e-6)
    let paare: RvArm['paare'] = null
    if (schmal && rr.status !== 'keine_zufahrt' && (zArm.zufluss || zufahrtVelo)) {
      // Fahrbahnachse (Mitte der AV-Fahrbahn) eines schmalen Arms; auf einem breiten Arm (nur einer schmal) fährt das Fahrzeug auf
      // seinem Fahrstreifen: Achse des Zufahrtsstreifens bzw. Fahrstreifenachse des rechten Arms. Beide ab ihrem Schnittpunkt
      const eng = (b: number | null) => b !== null && b <= SCHMAL_M + 1e-6
      const mitte = (ml: P[], q: Querschnitt) => mitVerlaengerung(versetzt(ml, (q.links - q.rechts) / 2))
      // Velo gegen die Einbahn auf der Zufahrt (E4): die Punkte liegen auf der Achse der Velos, nicht auf der Fahrbahnachse
      const a1 = eng(bZ) && !zufahrtVelo ? mitte(zMl, qsZ!) : zAchse, a2 = eng(bR) ? mitte(haupt[1].ml, haupt[1].qs) : mitVerlaengerung(rr.achse)
      if (zufahrtVelo) hinweise.push('Abb. 5: auf der Zufahrt fahren nur Velos gegen die Einbahn; die Punkte der Zufahrt liegen auf ihrer Achse.')
      else if (!eng(bZ) || !eng(bR)) hinweise.push(`Abb. 5: nur ${eng(bZ) ? 'die Zufahrt' : 'der rechte Arm'} ist höchstens ${f2(SCHMAL_M)} m breit; ` +
        `auf dem breiteren Arm liegen die Punkte auf ${eng(bZ) ? 'der Fahrstreifenachse des rechten Arms' : 'der Achse des Zufahrtsstreifens'}.`)
      const x = schnittBei(a1, a2, kp)
      rvAchsen = [abBogen(a1, x ? x.sa : lot(a1, kp).s), abBogen(a2, x ? x.sb : lot(a2, kp).s)]
      if (!x) hinweise.push('Abb. 5: kein Schnitt der Achsen, Anfang als Lot vom Knoten.')
      paare = paarmatrix(rvAchsen[0], rvAchsen[1], flaechenRv)
      for (const id of paare.ohneFlaechen) hinweise.push(`Abb. 5: ein Punkt der Fahrbahnachse liegt in «${hvAlle.find(v => v.id === id)?.name ?? id}»: ` +
        'für die Paarmatrix nicht gerechnet.')
      if (!paare.frei) {
        rr.status = 'nicht_erfuellt'
        rr.statusZusatz.push('Sichtfeld nach Abb. 5 nicht frei')
        rr.hinweise.push(`Abb. 5 (schmale Zufahrt): ${paare.paare.length - paare.sichtbar} von ${paare.paare.length} Sichtlinien verdeckt; ` +
          `erste verdeckte Kombination ${f1(paare.erste!.s1)} m auf ${armText(zArm)} und ${f1(paare.erste!.s2)} m auf ${armText(rArm!)} ab dem ` +
          `Schnitt der Fahrbahnachsen (${paare.erste!.verdecker}).`)
      }
    }
    const zust = rr.rv ? zustandAbb6(wahr, rr.vorhanden) : null
    const grundKeine = !rArm ? 'kein Arm rechts der Zufahrt: kein Verkehr hat Vortritt vor dieser Zufahrt' :
      !zArm.zufluss && !zufahrtVelo ? 'Einbahn vom Knoten weg: auf diesem Arm kein vortrittsbelasteter Verkehr' :
      // Velo gegen die Einbahn auf dem rechten Arm (E4): von rechts nur Velos, geprüft nach Tab. 3 (Block Veloverkehr)
      !rArm.zufluss && rArm.veloZufluss ? `der Arm rechts (${armText(rArm)}) ist eine Einbahn vom Knoten weg: von rechts kommen nur Velos ` +
        `(OSM ${rArm.veloZuflussQuelle}), geprüft nach Tab. 3 mit ${RV_TEMPO} km/h` :
      !rArm.zufluss ? `der Arm rechts (${armText(rArm)}) ist eine Einbahn vom Knoten weg: kein Verkehr von rechts` : ''
    const st: RvStatus = grundKeine || !zust ? 'keine' : paare && !paare.frei ? 'nicht_erfuellt' : RV_STATUS[zust]
    const arm: RvArm = { arm: zArm.key, armName: armText(zArm), rechts: rArm?.key ?? null, rechtsName: rArm ? armText(rArm) : '–',
      vorhanden: st === 'keine' ? 0 : rr.vorhanden, bisEnde: st !== 'keine' && rr.bisEnde, zustand: st === 'keine' ? null : zust, status: st,
      grund: grundKeine, breite: bZ, breiteRechts: bR, schmal, paare,
      ...(rArm && !rArm.zufluss && rArm.veloZufluss && (zArm.zufluss || zufahrtVelo) ? { nurVelo: rArm.veloZuflussQuelle } : {}) }
    rechtsvortritt = { wahrnehmbarkeit: wahr, wahrnehmbarkeitGewaehlt: ke.wahrnehmbarkeit !== null, tempo: RV_TEMPO, B: RV_B_M, arm,
      alle: null, fahrbahnachsen: rvAchsen }
    if (ke.wahrnehmbarkeit === null)
      annahmen.push(`Wahrnehmbarkeit des Knotens «${WAHRNEHMBARKEIT_TEXT[wahr]}» angenommen (Ziffer 18; im Panel wählbar).`)
    annahmen.push(`Rechtsvortritt (VSS 40 273 Teil E): Zufahrtstempo ${RV_TEMPO} km/h für alle Arme (Ziffer 15), Zielpunkte auf der ` +
      `Fahrstreifenachse des rechten Arms (zum Knoten fahrender Fahrstreifen, d ${f2(D_MFZ_M)} m) bis ${RV_ZIEL_M} m ab K; Zustand nach ` +
      `Abb. 6 aus Wahrnehmbarkeit und vorhandener Sichtweite (Stufen ${ABB6_GRENZEN.join(', ')} m, dazwischen die nächsttiefere); ` +
      `${RV_A_M} m anzustreben, mindestens 15 m nur bei sehr guter Wahrnehmbarkeit (Ziffer 16).`)
    annahmen.push(`Schmale Zufahrt (Abb. 5): Fahrbahn höchstens ${f2(SCHMAL_M)} m nach dem AV-Querschnitt der Zufahrt bzw. des rechten Arms ` +
      `(${bZ !== null ? `Zufahrt ${f1(bZ)} m` : 'Zufahrt ohne AV-Querschnitt'}, ${bR !== null ? `rechter Arm ${f1(bR)} m` : 'rechter Arm ohne ' +
      'AV-Querschnitt'}); dann Punkte alle ${PAAR_SCHRITT_M} m bis ${PAAR_LAENGE_M} m ab dem Schnittpunkt auf der Fahrbahnachse eines ` +
      `schmalen bzw. dem Fahrstreifen eines breiten Arms, geprüft die Sichtlinien aller Paare, deren Abstände zusammen höchstens ` +
      `${PAAR_LAENGE_M} m ergeben (Anhaltestrecke beider Fahrzeuge; Auslegung der Abb. 5, mit der Fachperson zu klären).`)
    annahmen.push('Rechtsvortritt: Velo von rechts nach Tab. 3 mit 30 km/h (untere Zeile); von links bzw. gegenüber keine Prüfung (der ' +
      'Verkehr von links muss der Zufahrt den Vortritt lassen, der Gegenverkehr hat beim Geradeausfahren kein Vortrittsverhältnis); ' +
      'Trottoir unverändert (Tab. 2).')
  }

  // Veloverkehr (E3b)
  const fText = (r: RichtungErgebnis) => `${lageNach(r)} ${VELOFUEHRUNG_TEXT[r.veloFuehrung]}${r.veloGewaehlt ? ' (gewählt)' :
    ` (${r.veloVorgabeQuelle})`}`
  annahmen.push(`Veloverkehr (VSS 40 273 Ziffer 13.3, Abb. 2): ${richtungen.map(fText).join(', ')}; Veloachse im Mischverkehr ` +
    `${f2(D_VELO_M)} m vom rechten Fahrbahnrand (d, Ziffer 10; bei einem Parkstreifen daneben), auf einem Radstreifen in seiner Mitte ` +
    `(Breite ${f2(RADSTREIFEN_M)} m angenommen, Achse ${f2(RADSTREIFEN_M / 2)} m vom Rand bzw. Parkstreifen), auf einem Radweg auf seiner ` +
    `Achse (OSM; ohne eigene Linie ${f2(RADWEG_BREITE_M)} m breit direkt am Fahrbahnrand angenommen). Tab. 3 nach der zulässigen ` +
    'Höchstgeschwindigkeit (OSM bzw. signalisiert von Hand) und der Längsneigung der Richtung; Spalten bis zur Spaltenzahl gerechnet ' +
    '(−4 < i ≤ −2: Spalte −2, −2 < i ≤ 0: Spalte 0); schnelle E-Bikes verboten: Spalten ≤ −4 und −2 talwärts, 0 eben, > 0 bergwärts. ' +
    'Beobachtungspunkt D wie für Motorfahrzeuge.')
  for (const r of richtungen) if (r.veloGegen) annahmen.push(`Velo gegen die Einbahn ${lageKurz(r)} (OSM ${r.veloGegen}): ` +
    `${r.velo ? `${VELOFUEHRUNG_TEXT[r.veloFuehrung]}, ` : ''}Veloachse am für das Velo rechten Fahrbahnrand, aus Sicht des Autoverkehrs ` +
    `am linken (Mischverkehr ${f2(D_VELO_M)} m vom Rand, Gegenverkehrsstreifen in seiner Mitte, ${f2(RADSTREIFEN_M)} m breit angenommen); ` +
    'von dieser Seite keine Motorfahrzeuge (Einbahn vom Knoten weg).')
  for (const r of richtungen) if (r.tempoAnnahme) annahmen.push(`Tempo ${lageNach(r)}: ohne Angabe in OSM ${TEMPO_ERSATZ} km/h angenommen.`)

  // Trottoir (E3b, Ziffer 13.2, Tab. 2): D' 3,00 m hinter der Trottoirhinterkante, Zielpunkte beidseits auf der Trottoirachse
  let trottoirPruefung: TrottoirPruefung | null = null, trottoirProfil: P[] = []
  if ((trAt || tueB) && !nurRv) {
    // Trottoirüberfahrt (K0): D' hinter dem hinteren Rand der Überfahrt, Zielpunkte auf der Gehlinie TUE_GEHLINIE_M vor dem hinteren
    // Trottoirrand je Seite (VSS 40 242 Ziffer 14.4); sonst (E3b) hinter der Trottoirhinterkante nach AV, Zielpunkte auf der Trottoirachse
    const sH = tueB ? tueB.sHinter : trAt!.sHinter
    const Dt = beobachtungAb(zAchse, sH, B_INNERORTS_M, dSeitlich)
    // Achse: Mitte der AV-Fläche Trottoir je Arm aus Querschnitten; sonst die Mitte des Trottoirs auf der Zufahrtsachse
    const mitte = punkteAufSpur(zAchse, [(beob.sRand + sH) / 2])[0]?.[0] ?? Dt.Dachse
    const lagen = lagenT!
    const quellen: string[] = []
    const linien = lagen.map((l, j) => {
      const anders = lagen[1 - j].t
      const abstand = tueB ? tueB.gehlinie[j] : l.t?.abstand ?? anders?.abstand ?? dist(mitte, lot(l.h.ml, mitte).p)
      quellen.push(tueB ? `${lageNach({ lage: lageLR[j] })} ${f2(tueB.hinten[j] - tueB.gehlinie[j])} m vor dem hinteren Trottoirrand ` +
        `(${tueB.herkunft[j]}), ${f2(Math.max(0, tueB.gehlinie[j] - l.rand))} m hinter dem Fahrbahnrand` :
        `${lageNach({ lage: lageLR[j] })} ${l.t ? `Mitte der AV-Fläche Trottoir (${l.t.n} Querschnitte, Breite ${f1(l.t.breite)} m)` :
        anders ? 'wie die Gegenseite' : 'Mitte des Trottoirs an der Zufahrt, parallel zur Strasse'}`)
      const linie = mitVerlaengerung(versetzt(l.h.ml, l.seite * abstand))
      const x = schnittBei(zAchse, linie, kp)
      return abBogen(linie, x ? x.sb : lot(linie, kp).s)
    })
    const hvT = hvAlle.filter(v => !imPolygon(Dt.D, v.poly))
    const mT = hoehen?.trottoir
    const trRichtungen = (['links', 'rechts'] as Richtung[]).map((r, j): TrottoirRichtung => {
      // Profil vom Ende links zum Ende rechts: i in Gehrichtung von rechts; von links −i
      const gemessen = mT !== undefined && mT.i !== null
      const i = gemessen ? (j === 0 ? -mT!.i! : mT!.i!) || 0 : 0
      const quelle = gemessen ? `${mT!.quelle}, ${tueB ? 'Gehlinie' : 'Trottoirachse'}` : mT ? `${mT.quelle}: 0 % angenommen` : hoehen ? 'ohne Profil: 0 % angenommen' :
        'Höhenmodell lädt: vorerst 0 %'
      const tw = trottoirSichtweite(i)
      const teil = sichtTeil(Dt.D, linien[j], Math.ceil(ZIEL_FAKTOR * tw.A), [...k.gebaeude, ...hvT], tw.A)
      return { ...teil, richtung: r, lage: lageLR[j], neigung: i, neigungQuelle: quelle, text: tw.text,
        hinweise: [...teil.hinweise, ...(mT?.hinweis && j === 0 ? [mT.hinweis] : [])] }
    })
    trottoirPruefung = { D: Dt.D, Dachse: Dt.Dachse, hinterkante: Dt.nullpunkt, achseQuelle: quellen.join('; '), richtungen: trRichtungen,
      ...(tueB ? { gehlinie: true } : {}) }
    trottoirProfil = [...abschneiden(linien[0], TROTTOIR_PROFIL_M).reverse(), ...abschneiden(linien[1], TROTTOIR_PROFIL_M).slice(1)]
    if (tueB) annahmen.push(`Trottoirüberfahrt, Phase Trottoir (VSS 40 242 Ziffer 14.4; Werte VSS 40 273 Ziffer 13.2, Tab. 2): ` +
      `Beobachtungspunkt D' ${zufahrtVelo ? '' : 'am Fahrersitz '}${f2(B_INNERORTS_M)} m hinter dem hinteren Rand der Überfahrt ` +
      `(${zufahrtVelo ? 'auf der Achse des Velogegenverkehrs' : `${f2(FAHRERSITZ_M)} m links der Zufahrtsachse`}); Zielpunkte auf der ` +
      `Gehlinie ${f2(TUE_GEHLINIE_M)} m vor dem hinteren Trottoirrand beidseits der Zufahrt (${quellen.join('; ')}); Längsneigung des ` +
      `Trottoirs in Gehrichtung auf die Zufahrt zu ${mT?.i !== null && mT?.i !== undefined ? `aus dem Höhenmodell (Ausgleichsgerade über ` +
      `${TROTTOIR_PROFIL_M} m beidseits)` : '0 % (ohne Messung)'}; Spalten der Tab. 2 bis zur Spaltenzahl gerechnet. Hindernisse wie für ` +
      'Motorfahrzeuge; Hecken und Zäune an der Grundstücksgrenze von Hand.')
    else annahmen.push(`Trottoir (Ziffer 13.2, Tab. 2): Beobachtungspunkt D' ${zufahrtVelo ? '' : 'am Fahrersitz '}${f2(B_INNERORTS_M)} m hinter der ` +
      `Trottoirhinterkante (${zufahrtVelo ? 'auf der Achse des Velogegenverkehrs' : `${f2(FAHRERSITZ_M)} m links der Zufahrtsachse`}); Zielpunkte auf der Trottoirachse beidseits der Zufahrt (${quellen.join('; ')}); ` +
      `Längsneigung des Trottoirs in Gehrichtung auf die Zufahrt zu ${mT?.i !== null && mT?.i !== undefined ? 'aus dem Höhenmodell ' +
      `(Ausgleichsgerade über ${TROTTOIR_PROFIL_M} m beidseits)` : '0 % (ohne Messung)'}; Spalten der Tab. 2 bis zur Spaltenzahl gerechnet ` +
      `(−6 < i ≤ −4: Spalte −4, −4 < i < 0: Spalte −2). Hindernisse wie für Motorfahrzeuge; Hecken und Zäune an der Grundstücksgrenze von Hand.`)
  }
  // Gesamtstatus je Richtung: schlechtester von Auto, Velo und Trottoir dieser Seite (Entscheid 1 vom 16.10.2026)
  for (const r of richtungen) {
    const tr = trottoirPruefung?.richtungen.find(x => x.richtung === r.richtung) ?? null
    const teile: [string, RichtungStatus][] = [...(r.status !== 'keine_zufahrt' ? [['Auto', r.status]] as [string, RichtungStatus][] : []),
      ...(r.velo ? [['Velo', r.velo.status]] as [string, RichtungStatus][] : []), ...(tr ? [['Trottoir', tr.status]] as [string, RichtungStatus][] : [])]
    r.gesamt = teile.length ? teile.reduce((a, b) => (RANG[b[1]] < RANG[a[1]] ? b : a))[1] : 'keine_zufahrt'
    r.gesamtFehlt = teile.filter(t => t[1] === 'nicht_erfuellt').map(t => t[0])
  }
  // Trottoirüberfahrt (K0): Ergebnis je Phase (Trottoir ab dem hinteren Rand, Fahrbahn ab der Bordkante)
  let trottoirueberfahrt: TueErgebnis | null = null
  if (tueB) {
    const seitenAv = lagenT!.map((l, j) => (l.t ? `${lageWort({ lage: lageLR[j] })} ${f2(l.t.breite)} m` : '')).filter(x => x)
    const breiteText = tueB.quelle === 'av_quer' ? `Breite ${f2(tueB.breite)} m aus der AV-Fläche Trottoir quer über die Zufahrt` :
      tueB.quelle === 'av_neben' ? `Breite ${f2(tueB.breite)} m nach dem ${seitenAv.length > 1 ? 'schmaleren ' : ''}angrenzenden Trottoir ` +
      `(AV ${seitenAv.join(', ')}; VSS 40 242 Ziffer 16: 2,00 bis 3,50 m); an der Einmündung zeigt die AV kein Trottoir (Planungsfall)` :
      tueB.quelle === 'eingabe' ? `Breite ${f2(tueB.breite)} m von Hand` :
      `Breite ${f2(TUE_BREITE_ANNAHME_M)} m angenommen (die AV zeigt kein Trottoir, keine Eingabe; VSS 40 242 Ziffer 16)`
    annahmen.push(`Trottoirüberfahrt (VSS 40 242): ${breiteText}; vorderer Rand an der Bordkante, hinterer Rand beidseits ${f2(tueB.breite)} m ` +
      `hinter dem Fahrbahnrand, auf der Zufahrtsachse ${f2(tueB.laenge)} m (Breite / sin α, α rund ${Math.round(einbiegewinkel)}°).`)
    // kurze Hinweise nur, wenn sie zutreffen (VSS 40 242 Ziffern 14.1, 14.2, 14.3.1, 14.3.4, 15.4.2)
    if (ao.ausserorts) hinweise.push('Trottoirüberfahrt ausserorts (nach OSM): nach VSS 40 242 Ziffer 14.1 nur innerorts.')
    if (durchgehend || gegenArm) hinweise.push('Die Zufahrt liegt auf der durchgehenden Strasse: nach VSS 40 242 Ziffer 14.2 Trottoirüberfahrt nur ' +
      'über die einmündende Strasse.')
    const vMax = Math.max(0, ...richtungen.filter(r => r.status !== 'keine_zufahrt' && (r.tempoArt === null || r.tempoArt === 'signalisiert'))
      .map(r => r.tempo))
    if (vMax > 50) hinweise.push(`Tempo auf der Hauptfahrbahn ${vMax} km/h: nach VSS 40 242 Ziffer 14.3.1 höchstens 50 km/h.`)
    if (!(durchgehend || gegenArm) && (einbiegewinkel < 45 || einbiegewinkel > 135)) hinweise.push(`Einbiegewinkel rund ${Math.round(einbiegewinkel)}°: nach VSS 40 242 ` +
      'Ziffer 14.3.4 nur zwischen 45° und 135°.')
    const velo = veloAufTrottoir(netz, haupt.map((h, j) => ({ arm: h.arm, seite: lagenT![j].seite })), k.osm.querungen ?? [],
      punkteAufSpur(zAchse, [(beob.sRand + tueB.sHinter) / 2])[0]?.[0] ?? null)
    if (velo) hinweise.push(`OSM: Velos auf dem Trottoir gestattet (${velo}): nach VSS 40 242 Ziffer 15.4.2 wie ein Radweg zu prüfen; nicht gerechnet.`)
    annahmen.push(`Trottoirüberfahrt, Phase Fahrbahn (VSS 40 242 Ziffer 14.4; Werte VSS 40 273 Tab. 1 und Tab. 3): B ab der ${nullpunktText}` +
      `${haltelinie || abRadweg ? ' (geht dem vorderen Rand der Überfahrt vor)' : ''}; vortrittsbelastet ist die Zufahrt (kein Rechtsvortritt).`)
    const schlecht = (xs: RichtungStatus[]): RichtungStatus => (xs.length ? xs.reduce((a, b) => (RANG[b] < RANG[a] ? b : a)) : 'keine_zufahrt')
    const fb: [string, RichtungStatus][] = richtungen.flatMap(r => [...(r.status !== 'keine_zufahrt' ? [[`${lageKurz(r)}: Auto`, r.status]] : []),
      ...(r.velo ? [[`${lageKurz(r)}: Velo`, r.velo.status]] : [])] as [string, RichtungStatus][])
    const tt: [string, RichtungStatus][] = (trottoirPruefung?.richtungen ?? []).map(t => [`${lageKurz(t)}: Trottoir`, t.status])
    const phase = (x: [string, RichtungStatus][]): TuePhase => ({ status: schlecht(x.map(y => y[1])),
      fehlt: x.filter(y => y[1] === 'nicht_erfuellt').map(y => y[0]) })
    trottoirueberfahrt = { breite: tueB.breite, breiteQuelle: tueB.quelle, breiteText, laenge: tueB.laenge,
      vorderkante: beobachtungAb(zAchse, beob.sRand, 0).nullpunkt, hinterkante: beobachtungAb(zAchse, tueB.sHinter, 0).nullpunkt,
      gehlinie: TUE_GEHLINIE_M, regelungText: regelung === 'stop' ? 'Stop (Zufahrt vortrittsbelastet)' : 'Vortritt: kein Rechtsvortritt an ' +
        'einer Trottoirüberfahrt, die Zufahrt ist vortrittsbelastet (VSS 40 242 Ziffer 12.3)', phaseTrottoir: phase(tt), phaseFahrbahn: phase(fb) }
  }

  // nötiger AV-Ausschnitt: weitester Zielpunkt ab dem Knoten plus Reserve (ohne Richtungen ohne Verkehr), mit Velo- und Trottoirachse
  const achsen2 = [...richtungen.flatMap(r => [r.achse, r.velo?.achse ?? []]), ...(trottoirPruefung?.richtungen.map(t => t.achse) ?? [])]
  const weit = Math.max(0, ...achsen2.flatMap(a => a.map(p => dist(kp, p))))
  const weitAv = Math.max(0, ...achsen2.flatMap(a => a.map(p => dist(avZentrum, p))))
  const avBedarf = Math.ceil(weitAv + AV_RESERVE_M)
  const hindernis: HindernisStand = nurRv ? { vorschlaege: [], amtlich: [], amtlichVerworfen: [], osmUeberdeckt: 0, inD, reichweite: 0 } :
    hindernisStand(k, hg, kp, weit + REICHWEITE_RESERVE_M, richtungen, D, inD)
  const bisD = Math.max(sNull - beob.sRand + B, ke.D ? sNull - beob.sRand + Dlage.laengs : 0)
  // Längsneigung der Zufahrt (E3a): Profil ab der Kante PROFIL_MIN_M vom Knoten weg; noch ohne Wirkung (Tab. 2 folgt in E3b)
  const zufahrtProfil = abschneiden(abBogen(zAchse, beob.sRand), PROFIL_MIN_M)
  const zufahrtNeigung = hoehen?.zufahrt ?? null
  if (zufahrtNeigung?.i !== null && zufahrtNeigung?.i !== undefined && Math.abs(zufahrtNeigung.i) > ZUFAHRT_STEIL_PROZENT + 1e-9)
    hinweise.push(`Steile Zufahrt: Längsneigung ${fi(zufahrtNeigung.i)} % in Fahrtrichtung von FB (Höhenmodell, ${zufahrtNeigung.quelle}); ` +
      'ohne Wirkung auf B (Ziffer 12 kennt keine Anpassung).')

  // Massnahmen nach Ziffer 14 (E3a): Varianten dieser Rechnung (D, Hindernisse, Tempo), ohne neue Daten
  const flaechen = [...k.gebaeude, ...hv]
  const variante = (v: Variante): VarianteRichtung[] => richtungen.filter(r => r.status !== 'keine_zufahrt' || r.velo).map(r => {
    const t = v.tempo?.[r.richtung] ?? r.tempo
    const fl = v.ohne ? flaechen.filter(f => !v.ohne!.includes(f.id)) : flaechen
    // Velo (E3b): dieselbe Variante auf der Veloachse; ein tieferes Tempo gilt als zulässige Höchstgeschwindigkeit der Tab. 3
    let velo: VarianteRichtung['velo'] = null
    if (r.velo) {
      // tieferes Tempo: höchstens die heutige zulässige Höchstgeschwindigkeit (ein V85 von Hand macht die Zeile nicht strenger)
      const Av = v.tempo?.[r.richtung] !== undefined ? veloSichtweite(Math.min(t, r.velo.tempo), r.velo.neigung, ke.ebikeVerboten).A : r.velo.A
      const flV = r.velo.ohneFlaechen.length ? fl.filter(f => !r.velo!.ohneFlaechen.includes(f.id)) : fl
      const sv = sichtEntlang(v.D ?? D, r.velo.achse, Math.max(r.velo.sMax, Math.ceil(ZIEL_FAKTOR * Av)), flV, Av)
      velo = { vorhanden: sv.vorhanden, massgebend: Av, reicht: sv.vorhanden + 1e-6 >= Av }
    }
    // Velo gegen die Einbahn (E4): von dieser Seite nur Velos
    if (r.status === 'keine_zufahrt')
      return { richtung: r.richtung, lage: r.lage, vorhanden: velo!.vorhanden, massgebend: velo!.massgebend, reicht: velo!.reicht, tempo: t, velo, nurVelo: true }
    const sw = t === r.tempo ? null : sichtweiteA(t, strasse.typ, strasse.ungunst, r.neigung)
    const A = sw ? sw.massgebend : r.massgebend
    const si = sichtEntlang(v.D ?? D, r.achse, r.sMax, fl, A)
    // Rechtsvortritt: Abb. 6 nicht «zu sanieren» und (schmale Zufahrt) Paarmatrix ohne die entfernten Hindernisse frei
    const st = r.rv ? (zustandAbb6(wahr, si.vorhanden) === 'sanieren' ? 'nicht_erfuellt' : 'erfuellt') :
      sichtStatus(si.vorhanden, sw ?? { massgebend: r.massgebend, oben: r.erforderlichOben })
    const paareFrei = !(r.rv && rvAchsen) || paarmatrix(rvAchsen[0], rvAchsen[1], v.ohne ? flaechenRv.filter(f => !v.ohne!.includes(f.id)) :
      flaechenRv).frei
    const auto = st !== 'nicht_erfuellt' && paareFrei
    return { richtung: r.richtung, lage: r.lage, vorhanden: si.vorhanden, massgebend: A, reicht: auto && (velo?.reicht ?? true), tempo: t, velo,
      ...(r.rv && rvAchsen ? { paareFrei } : {}) }
  })
  const bezug = abRadweg ? 'Aussenkante des Radwegs' : trAt && !ke.trottoirFrei && !tue ? 'Trottoirhinterkante' : 'Kante'
  const massnahmen = nurRv ? null : massnahmenRechnen({ richtungen, variante, ausserorts: ao.ausserorts, regelung, grundstueck: !!g,
    rechtsvortritt: rechtsvortritt ? { aufheben: rechtsvortritt.arm.status === 'nicht_erfuellt', verdecker: rechtsvortritt.arm.paare?.verdecker ?? [],
      wahrnehmbarkeit: rechtsvortritt.arm.status === 'keine' ? [] : WAHRNEHMBARKEITEN.map(w => `${WAHRNEHMBARKEIT_TEXT[w]}${w === wahr ?
        ' (heute)' : ''}: ${ZUSTAND_TEXT[zustandAbb6(w, rechtsvortritt!.arm.vorhanden)]} bei ${f1(rechtsvortritt!.arm.vorhanden)} m`) } : null,
    haltelinie: ke.D ? null : { dHeute: sNull + B - sNormal, bezug, lage: b => {
      const l = beobachtungAb(zAchse, sNormal + b - B, B, dSeitlich)
      return { D: l.D, haltelinie: l.nullpunkt }
    } },
    dStop: ke.D ? null : beobachtungAb(zAchse, sNull, B_INNERORTS_M, dSeitlich).D })

  // Rechtsvortritt, alle Arme (E3c): dieselbe Rechnung je Arm gegen seinen rechten Nachbarn, mit den Vorgaben (ohne Haltelinie, D,
  // Neigung und Trottoir-Häkchen des gewählten Arms)
  if (rechtsvortritt && ke.alleArme && !nurRv) {
    const keA: Required<KnotenEingaben> = { ...knotenEingabenAus(undefined), regelung: 'rechtsvortritt', wahrnehmbarkeit: ke.wahrnehmbarkeit }
    const egA: SichtEingaben = { ...eg, neigung: { links: null, rechts: null } }
    rechtsvortritt.alle = nachNr(info.arme).map(a => a.key === zArm.key ? rechtsvortritt!.arm :
      rechneZufahrt(k, info, a, false, egA, keA, avRadius, hg, avZentrum, null, null, tempoAmtlich, true).rechtsvortritt!.arm)
  }

  return { knoten: g ? null : info.id, zufahrt: zArm.key, zufahrtName: g?.weg != null ? `${zArm.nr} ${zName}` : armText(zArm),
    zufahrtspunkt: g ? { eingabe: g.eingabe, richtung: g.richtung, gezeichnet: g.gezeichnet, weg: g.weg, strasse: g.strasse } : null,
    D, Dachse, Dvorgabe: vorgabe.D, Dhand: !!ke.D, Dlage, fbRichtung, rand: beob.rand, nullpunkt: vorgabe.nullpunkt, nullpunktText,
    regelung, regelungVorgabe: rVorgabe, regelungQuelle: rQuelle, regelungGewaehlt: ke.regelung !== null, haltelinie, trottoir, trottoirGrund, B,
    ausserorts: ao.ausserorts, zufahrtAchse: abschneiden(abBogen(zAchse, Math.max(0, beob.sRand - 2)), Math.max(B, bisD) + 12),
    zufahrtLageQuelle: zQuelle, vortritt: [aL.key, aR.key], einbiegewinkel, richtungen, strasse, avRadius, avBedarf, annahmen, hinweise,
    hindernis, zufahrtProfil, zufahrtNeigung, massnahmen, radwegRand: abRadweg ? xRadweg!.p : null, trottoirPruefung, trottoirProfil,
    rechtsvortritt, zufahrtVelo, seiteOhneArm, ...(trottoirueberfahrt ? { trottoirueberfahrt } : {}) }
}

/** Veloführung einer Richtung (E3b): in der Rechnung, Vorgabe aus OSM mit Quelle, Radweg (OSM bzw. angenommen) */
interface VeloStand { fuehrung: Velofuehrung; vorgabe: Velofuehrung; quelle: string; gewaehlt: boolean; radweg: RadwegLage | null
  radwegOsm: RadwegLage | null }
/** Ziffer 12: Toleranz am Grenzwert 2,00 m (Rundung der Lage) und höchster Abstand der OSM-Radweglinie vom Schnitt mit der
 *  Zufahrtsachse über die halbe Breite hinaus [m] */
const RADWEG_TOL_M = 0.05
const RADWEG_AN_ZUFAHRT_M = 3
/** Trottoir: Höhenprofil so weit beidseits der Zufahrt [m] (grösster Wert der Tab. 2) */
export const TROTTOIR_PROFIL_M = Math.max(...TAB2)
const RANG: Record<RichtungStatus, number> = { nicht_erfuellt: 0, massgebend: 1, erfuellt: 2, keine_zufahrt: 3 }
/** Rechtsvortritt (E3c): Zustand nach Abb. 6 als Status der Richtung bzw. des Arms */
const ZUSTAND_STATUS: Record<Zustand, RichtungStatus> = { anzustreben: 'erfuellt', zulaessig: 'massgebend', sanieren: 'nicht_erfuellt' }
export const RV_STATUS: Record<Zustand, RvStatus> = { anzustreben: 'erfuellt', zulaessig: 'bedingt', sanieren: 'nicht_erfuellt' }

/** K0: Velos auf dem Trottoir an der Überfahrt nach OSM: Tag sidewalk[:both|:Seite der Zufahrt]:bicycle=yes|designated an einem Arm der
 *  Vortrittsstrasse bzw. ein Fussweg (nicht Querung) mit bicycle=yes|designated höchstens VELO_TROTTOIR_M neben der Mitte des Bands.
 *  -> Tag als Text bzw. null */
const VELO_TROTTOIR_M = 5
function veloAufTrottoir(netz: OsmNetz, arme: { arm: ArmInfo; seite: 1 | -1 }[], querungen: OsmDaten['querungen'], mitte: P | null): string | null {
  const ja = (v: string | undefined) => v === 'yes' || v === 'designated'
  for (const { arm, seite } of arme) {
    if (arm.wid < 0 || !netz.W.has(arm.wid)) continue
    const t = netz.w(arm.wid).t
    // Seite der Zufahrt in Digitalisierrichtung des Wegs: links von u, wenn der Arm in Wegrichtung läuft
    const wl = (seite === 1) === (arm.sd > 0) ? 'left' : 'right'
    for (const key of ['sidewalk:bicycle', 'sidewalk:both:bicycle', `sidewalk:${wl}:bicycle`]) if (ja(t[key])) return `${key}=${t[key]}`
  }
  if (mitte) for (const w of querungen) {
    const tg = w.tags
    if (!['footway', 'path'].includes(tg.highway ?? '') || tg.footway === 'crossing' || tg.path === 'crossing' || !ja(tg.bicycle)) continue
    const l = w.geom.map(([la, lo]) => lv95(la, lo))
    if (l.slice(0, -1).some((q, i) => abstandStrecke(mitte, q, l[i + 1]) <= VELO_TROTTOIR_M)) return `Weg ${w.id} highway=${tg.highway} bicycle=${tg.bicycle}`
  }
  return null
}

/** Sicht von D auf eine Achse ab K (Velo, Trottoir; E3b): erfüllt ab A, sonst nicht erfüllt (Tab. 2 und 3 ohne Bereich). Hindernisse
 *  (nicht Gebäude der AV), in denen ein Zielpunkt bis A liegt, zählen nicht (die Achse läuft durch sie hindurch, z. B. ein Parkfeld
 *  breiter als der Parkstreifen-Abzug): Hinweis */
function sichtTeil(D: P, achse: P[], sMax: number, flaechenAlle: Verdeckend[], A: number): SichtTeil {
  const ziel: number[] = []
  for (let s = 0; s <= A + 1e-9; s += 0.5) ziel.push(s)
  const zp = punkteAufSpur(achse, ziel).map(x => x[0])
  const durch = flaechenAlle.filter(f => f.quelle && f.quelle !== 'AV' && zp.some(p => imPolygon(p, f.poly)))
  const flaechen = durch.length ? flaechenAlle.filter(f => !durch.includes(f)) : flaechenAlle
  const si = sichtEntlang(D, achse, sMax, flaechen, A)
  const vd = si.verdecker as Verdeckend | null
  const frei = Math.min(si.vorhanden, A)
  const ohneFlaechen = durch.map(f => f.id)
  const hinweise: string[] = durch.map(f => `Die Achse läuft bis A durch «${f.name}» (${f.quelle}): für diese Sicht nicht gerechnet; Lage ` +
    'prüfen (z. B. Parkfeld breiter als der angenommene Parkstreifen).')
  const pal = si.palisade
  if (pal && (pal.anteil > 0 || pal.zaehlt))
    hinweise.push(`Palisade (Bäume): ${Math.round(pal.anteil * 100)} % der Strecke bis A verdeckt, längste Strecke ${f1(pal.laengste)} m` +
      `${pal.zaehlt ? ` (ab ${f1(PALISADE_MIN_M)} m: zählt als Verdeckung)` : ''}.`)
  return { A, K: achse[0], achse: abschneiden(achse, sMax), sMax, sichtpunkte: si.punkte, sichtbar: si.sichtbar, vorhanden: si.vorhanden,
    bisEnde: si.bisEnde, status: si.vorhanden + 1e-6 >= A ? 'erfuellt' : 'nicht_erfuellt',
    verdecker: vd ? { id: vd.id, name: vd.name, art: vd.art ?? 'Gebäude', quelle: vd.quelle ?? 'AV', ring: vd.poly[0], sVerdeckt: si.sVerdeckt ?? 0 } : null,
    verdeckerListe: si.liste.map(t => ({ id: t.v.id, name: t.v.name, art: t.v.art ?? 'Gebäude', quelle: t.v.quelle ?? 'AV',
      wirkung: t.v.wirkung ?? 'voll', sErst: t.sErst, strecke: t.strecke, ring: t.v.poly[0] })), palisade: pal,
    dreieckFrei: sichtdreieck(D, achse, 0, frei), dreieckVerdeckt: si.vorhanden < A ? sichtdreieck(D, achse, si.vorhanden, A) : [], hinweise,
    ohneFlaechen }
}

/**
 * Vorschläge und amtliche Parkfelder für Panel und Karte: OSM-Parkierung im Sichtfeld (Dreieck bis zum Ende der Zielpunkte),
 * ohne die von amtlichen Feldern abgedeckte; Bäume aus dem Baumkataster und amtliche Felder bis reichweite vom Knoten. Ohne
 * verworfene (amtliche: getrennt aufgeführt) und ohne bestätigte (Id schon unter den Hindernissen).
 */
function hindernisStand(k: Kontext, hg: HindernisEingaben, kp: P, reichweite: number, richtungen: RichtungErgebnis[], D: P,
  inD: string[]): HindernisStand {
  const weg = new Set(hg.verworfen), da = new Set(hg.hindernisse.map(h => h.id))
  const offen = (id: string) => !weg.has(id) && !da.has(id)
  const felder = hg.park?.felder ?? []
  const dreiecke = richtungen.filter(r => r.achse.length >= 2).map(r => sichtdreieck(D, r.achse, 0, r.sMax))
  const osmAlle = parkVorschlaege(k.netz, k.fahrbahn, kp).filter(v => offen(v.id))
  // nur Auto-Felder beschreiben dieselbe Parkierung wie ein OSM-Streifen (Zweirad-Felder sind nur Hinweis)
  const ueberdeckt = osmUeberdeckt(osmAlle, felder.filter(f => f.klasse === 'auto').map(f => f.ring))
  const osm = osmAlle.filter(v => !ueberdeckt.has(v.id) && v.hindernis.art === 'parkfeld' && imSichtfeld(v.hindernis.ring, dreiecke))
  const baeume = hg.baeume ? baumVorschlaege(hg.baeume.baeume, kp, reichweite, hg.baeume.quellenangabe).filter(v => offen(v.id)) : []
  const amtlichAlle = hg.park ? parkKatasterFelder(felder, kp, reichweite, hg.park.quellenangabe) : []
  return { vorschlaege: [...osm, ...baeume], amtlich: amtlichAlle.filter(v => !weg.has(v.id)),
    amtlichVerworfen: amtlichAlle.filter(v => weg.has(v.id)), osmUeberdeckt: ueberdeckt.size, inD, reichweite: Math.round(reichweite) }
}

function richtungRechnen(k: Kontext, richtung: Richtung, lage: Lage, a: ArmInfo, ml: P[], qs: Querschnitt, zAchse: P[], D: P, kp: P,
  strasse: StrasseErgebnis, ns: NeigungStand, avRadius: number, hindernisse: Verdeckend[], park: ParkRaster | null,
  te0: TempoEingabe | null, amtlich: TempoAmtlichDaten | null, rvR: { wahr: Wahrnehmbarkeit } | { grund: string } | null, avZentrum: P, vs: VeloStand,
  ebikeVerboten: boolean): RichtungErgebnis {
  const { netz } = k
  const hinweise: string[] = []
  // Rechtsvortritt (E3c): Tempo 30 km/h fest (Ziffer 15), Eingaben von Hand ohne Wirkung
  const rvWahr = rvR && 'wahr' in rvR ? rvR.wahr : null
  const te: TempoEingabe | null = rvR ? { art: 'signalisiert', wert: RV_TEMPO, begruendung: '' } : te0
  const spur = richtung === 'links' ? 'nah' : 'fern'
  // Tempo: OSM des Arms, Mehrheit entlang der Achse über die massgebende Länge; ohne Angabe 50 km/h (Annahme); von Hand (E2b)
  const w = wegTempo(netz, a.wid)
  const [t, treffer] = tempoEntlang(netz, ml, w ? w[0] : TEMPO_ERSATZ, 0, x => sichtweiteA(x).massgebend)
  const tempoOsm = treffer ? t : w ? w[0] : TEMPO_ERSATZ
  // K0: amtliches Tempo (Stadt Bern V_sig) entlang derselben Linie vor OSM; ohne Treffer bleibt OSM
  const am = amtlich ? amtlichEntlang(netz, ml, tempoOsm, 0, x => sichtweiteA(x).massgebend, amtlich) : null
  const ta = am?.tempo ?? 0, trefferA = !!am?.treffer
  const tempoVorgabe = trefferA ? ta : tempoOsm
  const vorgabeAnnahme = !trefferA && !treffer && !w
  const tempoVorgabeQuelle = trefferA ? `${amtlich!.quelle} (signalisierte Höchstgeschwindigkeit V_sig, Mehrheit entlang der Achse)` :
    vorgabeAnnahme ? `Annahme (ohne OSM-Angabe)` : w && tempoVorgabe === w[0] ? w[1] : 'OSM maxspeed (Mehrheit entlang der Achse)'
  if (trefferA && ta !== tempoOsm && !rvR)
    hinweise.push(`Tempo ${ta} km/h laut ${amtlich!.quelle} (signalisierte Höchstgeschwindigkeit), OSM ${!treffer && !w ? 'ohne Angabe' :
      `${tempoOsm} km/h`}.`)
  else if (am && !trefferA && a.zufluss && !rvR)
    hinweise.push(`${amtlich!.quelle}: ${!am.innen ? 'Richtung ausserhalb des geladenen Bereichs' : !am.wert && !am.leer ?
      'entlang dieser Richtung keine Linie' : `${am.wert} von ${am.wert + am.leer} Punkten an einer Linie mit Wert`}: Tempo aus OSM.`)
  const tempo = te ? te.wert : tempoVorgabe
  const tempoAnnahme = !te && vorgabeAnnahme
  const tempoQuelle = rvR ? `Rechtsvortritt: Zufahrtsgeschwindigkeit ${RV_TEMPO} km/h (VSS 40 273 Ziffer 15)` :
    te ? `von Hand: ${TEMPO_ART_TEXT[te.art]}${te.begruendung.trim() ? ` (${te.begruendung.trim()})` : ''}` : tempoVorgabeQuelle
  if (!rvR && te && te.art === 'signalisiert' && te.wert !== tempoVorgabe && !vorgabeAnnahme)
    hinweise.push(`Signalisiertes Tempo von Hand ${te.wert} km/h, ${trefferA ? amtlich!.quelle : 'OSM'} ${tempoVorgabe} km/h: Signalisation vor Ort prüfen.`)
  const sw0 = sichtweiteA(tempo, strasse.typ, strasse.ungunst, ns.i)
  // Rechtsvortritt: massgebend die kleinste Sichtweite, die nach Abb. 6 nicht «zu sanieren» ist (sehr schlecht: keine, 25 m gezeigt),
  // oberer Wert die grösste Stufe der Abb. 6; Zielpunkte bis RV_ZIEL_M
  const rvMin = rvWahr ? rvMindest(rvWahr) : null
  const rvA = rvMin ? rvMin.zulaessig ?? ABB6_GRENZEN[2] : 0
  const sw = rvMin ? { ...sw0, massgebend: rvA, oben: ABB6_GRENZEN[2], typWert: RV_A_M, anhalteAngewendet: false, hinweise: [], hinweis: null,
    massgebendText: `Abb. 6, Wahrnehmbarkeit ${WAHRNEHMBARKEIT_TEXT[rvWahr!]}${rvMin.zulaessig === null ? ': keine Sichtweite genügt' :
      rvMin.zulaessig === rvMin.anzustreben ? '' : `; anzustreben ${rvMin.anzustreben ?? '–'} m`}`,
    typText: `Rechtsvortritt: ${RV_A_M} m anzustreben (Ziffer 16)` } : sw0
  if (ns.hinweis) hinweise.push(ns.hinweis)
  if (sw.hinweis) hinweise.push(sw.hinweis)
  hinweise.push(...sw.hinweise)
  if (rvMin && Math.abs(ns.i) > NEIGUNG_EBEN_PROZENT + 1e-9)
    hinweise.push(`Längsneigung ${fi(ns.i)} %: die Werte für den Rechtsvortritt gelten ohne Längsneigung (Ziffer 16); bei Gefälle ` +
      'mehr Sichtweite vorsehen (nicht gerechnet).')
  const sMax = rvMin ? RV_ZIEL_M : zielLaenge(sw)
  const rvGrund = rvR && 'grund' in rvR ? rvR.grund : null
  // Velo gegen die Einbahn (E4): Einbahn vom Knoten weg, aber Velozufluss (OSM-Tag); von dieser Seite kommen nur Velos (beim
  // Rechtsvortritt nur der Arm rechts, mit Tab. 3 bei 30 km/h)
  const nurVelo = !a.zufluss && a.veloZufluss && !rvGrund ? a.veloZuflussQuelle : null
  // Parkstreifen am rechten Rand dieses Verkehrs (vom Knoten bis zum Ende der Zielpunkte): Achse d neben dem Parkstreifen
  const ps: ParkStreifen = a.zufluss || nurVelo ? parkStreifen(sondenRechts(ml, qs, sMax), park) : KEIN_PARKSTREIFEN
  // Radstreifen (E3b): die Autoachse liegt d neben dem Radstreifen (Abzug RADSTREIFEN_M wie fgsCheck)
  const veloAbzug = vs.fuehrung === 'radstreifen' ? RADSTREIFEN_M : 0
  const fa = mitVerlaengerung(fahrstreifenAchse(ml, qs, D_MFZ_M + ps.abzug + veloAbzug))
  const x = schnittBei(zAchse, fa, kp)
  let sK: number
  if (x) sK = x.sb
  else { sK = lot(fa, kp).s; hinweise.push('Kein Schnitt der Zufahrtsachse mit der Fahrstreifenachse: K als Lot vom Knoten.') }
  const achse = abBogen(fa, sK)
  const K = achse[0]
  const weit = a.zufluss ? Math.max(...abschneiden(achse, sMax).map(p => dist(avZentrum, p))) : 0
  if (weit > avRadius - 5)
    hinweise.push(`Zielpunkte reichen über den AV-Ausschnitt (±${avRadius} m) hinaus: weiter weg fehlen Gebäude` +
      (weit + AV_RESERVE_M > AV_MAX_M ? ` (nachgeladen wird höchstens ±${AV_MAX_M} m).` : '.'))
  const basis = { richtung, lage, arm: a.key, strasse: armText(a), spur, tempo, tempoQuelle, tempoAnnahme, tempoVorgabe, tempoVorgabeQuelle,
    tempoArt: rvR ? null : te?.art ?? null, tempoBegruendung: rvR ? '' : te?.begruendung.trim() ?? '', stufe: sw.stufe,
    erforderlichUnten: sw.unten, erforderlichOben: sw.oben, zwischenwert: sw.zwischen, typStufe: sw.typStufe, typWert: sw.typWert,
    typText: sw.typText, neigung: sw.neigung, neigungVorgabe: ns.vorgabe, neigungHand: ns.hand,
    // ohne Verkehr von dieser Seite kein Profil
    neigungQuelle: (a.zufluss && !rvGrund) || nurVelo || ns.hand ? ns.quelle : rvGrund ? 'nicht geprüft: ohne Profil' :
      'kein Verkehr von dieser Seite: ohne Profil',
    neigungVorgabeQuelle: (a.zufluss && !rvGrund) || nurVelo ? ns.vorgabeQuelle : rvGrund ? 'nicht geprüft: ohne Profil' :
      'kein Verkehr von dieser Seite: ohne Profil',
    anhalte: sw.anhalte, anhalteAngewendet: sw.anhalteAngewendet,
    massgebend: sw.massgebend, massgebendText: sw.massgebendText, sMax, K, randAbstand: D_MFZ_M + ps.abzug + veloAbzug,
    lageQuelle: `${qs.quelle}; ${parkStreifenText(ps)}${veloAbzug ? `; Radstreifen ${f2(RADSTREIFEN_M)} m (Annahme), Achse ${f2(D_MFZ_M)} m ` +
      'daneben' : ''}`, parkStreifen: ps,
    veloFuehrung: vs.fuehrung, veloVorgabe: vs.vorgabe, veloVorgabeQuelle: vs.quelle, veloGewaehlt: vs.gewaehlt } as const
  // Veloverkehr (E3b, Ziffer 13.3): Veloachse je Führung, Tab. 3 nach der zulässigen Höchstgeschwindigkeit und der Neigung
  // Velo gegen die Einbahn (E4): dieselbe Achse am für das Velo rechten Rand (aus Sicht des Autoverkehrs dem linken)
  const veloRechnen = (): VeloErgebnis | null => {
    if (vs.fuehrung === 'kein') return null
    const rw = vs.radweg
    const versatz = vs.fuehrung === 'misch' ? qs.links - ps.abzug - D_VELO_M : vs.fuehrung === 'radstreifen' ?
      qs.links - ps.abzug - RADSTREIFEN_M / 2 : rw!.versatz
    const lageText0 = vs.fuehrung === 'misch' ? `${f2(D_VELO_M)} m vom rechten Fahrbahnrand${ps.abzug ? ' neben dem Parkstreifen' : ''} (Mischverkehr)` :
      vs.fuehrung === 'radstreifen' ? `Mitte des Radstreifens, ${f2(ps.abzug + RADSTREIFEN_M / 2)} m vom rechten Fahrbahnrand` :
      rw!.id ? `Achse des Radwegs (OSM-Weg ${rw!.id}${rw!.eigeneSeite ? '' : ', gegenüber, in beiden Richtungen'}), ${f2(Math.abs(rw!.versatz) -
        (rw!.eigeneSeite ? qs.links : qs.rechts))} m ${rw!.eigeneSeite ? 'neben dem rechten' : 'neben dem linken'} Fahrbahnrand` :
      `Achse des Radwegs ohne OSM-Linie: ${f2(RADWEG_BREITE_M)} m breit direkt am Fahrbahnrand angenommen`
    const lageText = !nurVelo ? lageText0 : (vs.fuehrung === 'radstreifen' ? lageText0.replace('Mitte des Radstreifens',
      'Mitte des Gegenverkehrsstreifens') : lageText0) + '; Velo gegen die Einbahn: am für das Velo rechten, aus Sicht des Autoverkehrs ' +
      'linken Fahrbahnrand'
    const va = mitVerlaengerung(versetzt(ml, versatz))
    const xv = schnittBei(zAchse, va, kp)
    const achseV = abBogen(va, xv ? xv.sb : lot(va, kp).s)
    // zulässige Höchstgeschwindigkeit: signalisiert von Hand bzw. OSM (V85, VP und fahrbares Tempo ändern die Zeile nicht)
    const vt = te && te.art !== 'signalisiert' ? tempoVorgabe : tempo
    const vsw = veloSichtweite(vt, ns.i, ebikeVerboten)
    const teil = sichtTeil(D, achseV, Math.ceil(ZIEL_FAKTOR * vsw.A), [...k.gebaeude, ...hindernisse], vsw.A)
    const vh = [...teil.hinweise]
    if (!xv) vh.push('Kein Schnitt der Zufahrtsachse mit der Veloachse: Anfang als Lot vom Knoten.')
    if (te && te.art !== 'signalisiert') vh.push(`Tab. 3 nach der zulässigen Höchstgeschwindigkeit ${vt} km/h (${tempoVorgabeQuelle}), nicht nach dem Tempo von Hand.`)
    if (ebikeVerboten && vt <= 30) vh.push('«Schnelle E-Bikes verboten» gilt nur über 30 km/h: ohne Wirkung.')
    const kurve = richtungsAenderung(achseV, vsw.A)
    if (kurve > KURVE_GRAD) vh.push(`Veloachse in einer Kurve (Richtungsänderung rund ${Math.round(kurve)}° bis A): A darf nach Ziffer 13.3 ` +
      'reduziert werden, wenn die gefahrenen Geschwindigkeiten tiefer sind; nicht gerechnet.')
    return { ...teil, fuehrung: vs.fuehrung, lageText, randAbstand: qs.links - versatz, radweg: rw, tempo: vt,
      tempoQuelle: vt === tempo ? tempoQuelle : tempoVorgabeQuelle, neigung: ns.i, text: vsw.text, ebike: vsw.ebike, hinweise: vh }
  }
  if (!a.zufluss || rvGrund) {
    // ohne Motorfahrzeuge von dieser Seite; mit Velo gegen die Einbahn die Velo-Prüfung, Profil der Neigung auf der Veloachse
    const velo = nurVelo ? veloRechnen() : null
    return { ...basis, vorhanden: 0, bisEnde: false, status: 'keine_zufahrt', statusZusatz: [], verdecker: null, verdeckerListe: [],
      palisade: null, achse: [], sichtpunkte: [], sichtbar: [], profilLinie: velo ? abschneiden(velo.achse, Math.max(PROFIL_MIN_M, velo.A)) : [],
      velo, gesamt: 'keine_zufahrt', gesamtFehlt: [], dreieck: [], dreieckFrei: [], dreieckVerdeckt: [],
      hinweise: [...hinweise, nurVelo ? `Einbahn vom Knoten weg: von dieser Seite kommen nur Velos (OSM ${nurVelo}).` :
        !a.zufluss ? 'Einbahn vom Knoten weg: von dieser Seite kommt kein Verkehr.' : `${rvGrund}.`],
      ...(rvGrund ? { keinGrund: rvGrund, rvKeine: true } : nurVelo ? { keinGrund: 'nur Velos (Einbahn vom Knoten weg)', veloGegen: nurVelo } : {}) }
  }
  // Rechtsvortritt: Sichtdreieck und Liste der Verdecker bis zum anzustrebenden Wert (mindestens RV_A_M), auch wenn weniger zulässig ist
  const A = rvWahr ? Math.max(sw.massgebend, RV_A_M) : sw.massgebend
  const si = sichtEntlang(D, achse, sMax, [...k.gebaeude, ...hindernisse], A)
  // Rechtsvortritt: Status nach Abb. 6 (anzustreben = erfüllt, zulässig = «massgebend», zu sanieren = nicht erfüllt)
  const zustand: Zustand | null = rvWahr ? zustandAbb6(rvWahr, si.vorhanden) : null
  const status = zustand ? ZUSTAND_STATUS[zustand] : sichtStatus(si.vorhanden, sw)
  const frei = Math.min(si.vorhanden, A)
  const vd = si.verdecker as Verdeckend | null
  const verdeckerListe: VerdeckerEintrag[] = si.liste.map(t => ({ id: t.v.id, name: t.v.name, art: t.v.art ?? 'Gebäude',
    quelle: t.v.quelle ?? 'AV', wirkung: t.v.wirkung ?? 'voll', sErst: t.sErst, strecke: t.strecke, ring: t.v.poly[0] }))
  // Statuszusatz und Hinweise zu Zweirädern, durchlässigen Zäunen und zur Palisade (ohne Statuswirkung)
  const statusZusatz: string[] = zustand ? [`Abb. 6: ${ZUSTAND_TEXT[zustand]}`] : []
  const hinweisArt = (f: (t: VerdeckerEintrag) => boolean) => verdeckerListe.filter(t => t.wirkung === 'hinweis' && f(t))
  const zweirad = hinweisArt(t => t.art.startsWith('Parkfeld'))
  if (zweirad.length) {
    statusZusatz.push('Hinweis: Zweiräder')
    hinweise.push(`Zweiräder im Sichtfeld, prüfen: ${zweirad.map(t => `${t.name} ab ${f1(t.sErst)} m`).join('; ')} (Velo- und ` +
      'Motorrad-Parkfelder ohne Statuswirkung).')
  }
  const zaun = hinweisArt(t => t.art.startsWith('Zaun'))
  if (zaun.length) {
    statusZusatz.push('Hinweis: Zaun')
    hinweise.push(`Sichtdurchlässiger Zaun bzw. Geländer im Sichtfeld ab ${f1(zaun[0].sErst)} m: Durchsicht vor Ort prüfen (Palisadenwirkung, ` +
      'VSS 40 273 Ziffer 11).')
  }
  const pal = si.palisade
  if (pal && (pal.anteil > 0 || pal.zaehlt)) {
    const proz = Math.round(pal.anteil * 100)
    if (!pal.zaehlt) statusZusatz.push(`Hinweis: Palisade ${proz} %`)
    const wertung = pal.zaehlt ? `(ab ${f1(PALISADE_MIN_M)} m: zählt als Verdeckung, Sichtweite endet davor)` :
      pal.hinterVoll ? '(liegt hinter der ersten vollen Verdeckung: ohne Wirkung)' :
      `(unter ${f1(PALISADE_MIN_M)} m: zählt nicht als Verdeckung)`
    hinweise.push(`Palisade (Bäume, VSS 40 273 Ziffer 11, Abb. 3): ${proz} % der Strecke bis A verdeckt, längste zusammenhängend verdeckte ` +
      `Strecke bis A ${f1(pal.laengste)} m ${wertung}.` + (pal.beiA ? ' Der Zielpunkt bei A liegt im Schatten eines ' +
      'Stamms: Sichtbarkeit des Fahrzeugs bei A vor Ort prüfen.' : ''))
  }
  const velo = veloRechnen()
  return {
    ...basis, vorhanden: si.vorhanden, bisEnde: si.bisEnde, status, statusZusatz, verdeckerListe, palisade: pal, velo,
    gesamt: status, gesamtFehlt: status === 'nicht_erfuellt' ? ['Auto'] : [], ...(rvWahr ? { rv: true } : {}),
    verdecker: vd ? { id: vd.id, name: vd.name, art: vd.art ?? 'Gebäude', quelle: vd.quelle ?? 'AV', ring: vd.poly[0],
      sVerdeckt: si.sVerdeckt ?? 0 } : null,
    achse: abschneiden(achse, sMax), sichtpunkte: si.punkte, sichtbar: si.sichtbar,
    profilLinie: abschneiden(achse, Math.max(PROFIL_MIN_M, A)),
    dreieck: sichtdreieck(D, achse, 0, A), dreieckFrei: sichtdreieck(D, achse, 0, frei),
    dreieckVerdeckt: si.vorhanden < A ? sichtdreieck(D, achse, si.vorhanden, A) : [],
    hinweise,
  }
}
