import { AV_LEGENDE, avKlasse } from './daten/anbieter/gemeinsam/avKarte'
import { regionalLegende } from './daten/anbieter/gemeinsam/regionalLegende'
import { ebenenQuellenText, objektQuellenText, regionalEbenenZustand, type QuellenLadeinfo } from './daten/anbieter/gemeinsam/ebenenQualitaet'
import { REGIONAL_DIENSTE } from './daten/anbieter/gemeinsam/regionalDienste'
import { zhStandText } from './daten/anbieter/gemeinsam/zuerich'
import { npvmStandText } from './daten/anbieter/npvm'
import { bavDatenstandText } from './daten/anbieter/gemeinsam/bav'
import { type QuellenQualitaet } from './daten/anbieter/gemeinsam/qualitaet'
// ── «Geladene Quellen» auf der Karte (seit 01.11.2026) ─────────────
//
// Was die Vorbelegung aus abrufbaren Quellen liest, ist je Quelle einzeln einblendbar (Fenster «Geladene Quellen» unten links,
// verschiebbar, wie im VeloroutenCheck). Gezeigt werden die beim Laden gelesenen Objekte (keine neue
// Abfrage), nach Wert gefärbt, ab BESCHRIFT_ZOOM mit dem Wert beschriftet; das Menü zeigt nur Quellen mit Daten. Gleiche
// Farbstufen wie VeloroutenCheck und SichtweitenCheck (Tempo 20/30/40/50/60+, DTV bis 2 000/5 000/10 000/20 000/darüber).
// Geometrie in LV95 (P); die Karte rechnet um. Nur Daten, keine Regeln.

import type { KatasterBaum } from './daten/baumkataster'
import { alphabetisch } from './daten/anbieter/gemeinsam/sortierung'
import type { P } from './geo'
import type { GeoVorbelegung } from './bedarf/vorbelegung'
import type { OsmWeg } from './daten/osm'
import { lv95 } from './geo'

export type EbeneId = 'av' | 'unfaelleFuss' | 'unfaelleVelo' | `regional.${string}` | 'tempo' | 'dtv' | 'haltestellen' | 'bav' | 'oev' | 'hierarchie' | 'strassentyp' | 'nutzungszonen' | 'schulen'
  | 'zhTempo' | 'zhZonen' | 'npvm' | 'baeume' | 'beleuchtung' | 'vortritt' | 'steigung' | 'bruecken' | 'gelaende'

export interface EbenenObjekt {
  id: string
  linien?: P[][]
  punkt?: P
  ringe?: P[][]
  klasse: string
  wert?: string             // kurze Beschriftung (Tempo, DTV, Neigung)
  text: string              // Tooltip (Punkte) bzw. Beschreibung
  profil?: true
  hoehenprofil?: import('./hoehenprofil/modell').HoehenProfil
  quelle?: string
  quellenSchluessel?: string
  datenstand?: string       // BAV: Stand der Ebene aus dem zugehörigen gespeicherten Ausschnitt
  gestrichelt?: boolean     // Ersatzquelle (OSM statt amtlich)
  deckkraft?: number        // Füllung einer Fläche (Standard 0,3)
}
export type EbenenDaten = Partial<Record<EbeneId, EbenenObjekt[]>> & { metadaten?: Readonly<Record<string, QuellenLadeinfo>>; qualitaet?: Partial<Record<EbeneId, QuellenQualitaet>> }

export interface EbeneDef {
  id: EbeneId
  titel: string
  quellenHinweis?: string
  quelle: string
  // symbol: Zeichen im Quadrat der Punkte (Form statt Farbe allein, Nutzerbefund 01.11.2026: Heime und LSA-Übergänge fast gleich violett);
  // Punkte der Quellen sind Quadrate mit Zeichen, die Objekte der Prüfung Kreise
  legende: [klasse: string, farbe: string, text: string, symbol?: string][]
}

export const BESCHRIFT_ZOOM = 18

export const TEMPO_FARBEN: [string, string, string][] = [
  ['t20', '#16a34a', '20 km/h und weniger'], ['t30', '#65a30d', '30 km/h'], ['t40', '#ca8a04', '40 km/h'],
  ['t50', '#ea580c', '50 km/h'], ['t60', '#dc2626', '60 km/h und mehr'],
]
export const tempoKlasse = (v: number): string => (v <= 20 ? 't20' : v <= 30 ? 't30' : v <= 40 ? 't40' : v <= 50 ? 't50' : 't60')
export const DTV_FARBEN: [string, string, string][] = [
  ['d2', '#16a34a', 'bis 2 000'], ['d5', '#ca8a04', '2 000–5 000'], ['d10', '#ea580c', '5 000–10 000'],
  ['d20', '#dc2626', '10 000–20 000'], ['d99', '#7f1d1d', 'über 20 000'],
]
export const dtvKlasse = (v: number): string => (v <= 2000 ? 'd2' : v <= 5000 ? 'd5' : v <= 10000 ? 'd10' : v <= 20000 ? 'd20' : 'd99')
const neigungKlasse = (i: number | null): string => (i == null ? 'n?' : Math.abs(i) > 6 ? 'n6' : Math.abs(i) > 2 ? 'n2' : 'n0')

export const EBENEN: readonly EbeneDef[] = [
  { id: 'av', titel: 'Amtliche Vermessung', quelle: 'geodienste.ch, amtliche Vermessung (Bodenbedeckung)', legende: AV_LEGENDE },
  ...[['unfaelleFuss','Unfälle mit Fussgängerbeteiligung (ASTRA)'],['unfaelleVelo','Unfälle mit Velobeteiligung (ASTRA)']].map(([id,titel]): EbeneDef => ({ id:id as EbeneId, titel, quelle:'© ASTRA; Unfälle mit Personenschaden; anonymisierte Lage, nur Kartenkontext, keine Regelwirkung', legende:regionalLegende('unfall') })),
  ...REGIONAL_DIENSTE.map((d): EbeneDef => ({ id: `regional.${d.id}`, titel: d.name, quellenHinweis: d.hinweis, quelle: `${d.anbieter}; ${d.lizenz}; ${d.hinweis}`, legende: regionalLegende(d.art) })),
  { id: 'zhTempo', titel: 'Tempo (Stadt Zürich)', quelle: 'Stadt Zürich, signalisierte Geschwindigkeiten; heutiger Zustand, CC0', legende: [...TEMPO_FARBEN, ['verbot', '#7f1d1d', 'Fahrverbot / ungeklärtes Regime']] },
  { id: 'zhZonen', titel: 'Verkehrszonen (Stadt Zürich)', quelle: 'Stadt Zürich, bestehende Verkehrszonen; CC0', legende: [['t30_zone', '#eab308', 'Tempo-30-Zone'], ['begegnungszone', '#16a34a', 'Begegnungszone'], ['fussgaengerzone', '#7c3aed', 'Fussgängerzone'], ['offen', '#64748b', 'ungeklärt']] },
  { id: 'baeume', titel: 'Bäume', quelle: 'Geoportal Stadt Bern, Baumkataster; gesamter geladener Ausschnitt',
    legende: [['baum', '#166534', 'Baum', 'B']] },
  { id: 'tempo', titel: 'Tempo', legende: TEMPO_FARBEN,
    quelle: 'Tempoquelle nicht geladen' },
  { id: 'npvm', titel: 'Verkehrsmenge (NPVM, modelliert)', legende: DTV_FARBEN, quelle: '© ARE; NPVM/AMG, modelliert, keine Zählung; Summe der Fahrtrichtungen je Modellstrecke; Übernahme bestätigen' },
  { id: 'dtv', titel: 'Verkehrsmenge (DTV)', legende: DTV_FARBEN, quelle: 'Geoportal Stadt Bern, Flächendeckende Verkehrsdaten' },
  { id: 'haltestellen', titel: 'ÖV-Haltestellen', quelle: 'Haltestellenquelle nicht geladen',
    legende: [['tram', '#b91c1c', 'Tram (auch mit Bus)', 'T'], ['bus', '#1d4ed8', 'Bus', 'B'], ['oev', '#475569', 'Haltestelle', 'H']] },
  { id: 'bav', titel: 'Haltestellen BAV', quelle: '© BAV; Haltestellenpunkte, keine Haltekanten',
    legende: [['tram', '#b91c1c', 'Tram (auch mit Bus)', 'T'], ['bus', '#1d4ed8', 'Bus', 'B']] },
  { id: 'oev', titel: 'ÖV-Linien', quelle: 'Geoportal Stadt Bern, ÖV-Linien',
    legende: [['tram', '#dc2626', 'Tram'], ['bus', '#7c3aed', 'Bus, Trolleybus'], ['andere', '#64748b', 'Zug, Drahtseilbahn']] },
  { id: 'hierarchie', titel: 'Strassenhierarchie', quelle: 'Geoportal Stadt Bern, Strassenhierarchie',
    legende: [['basisnetz', '#ff7f7f', 'Basisnetz'], ['quartierverbindung', '#ffd37f', 'Quartierverbindungsstrasse'],
      ['quartier', '#a3ff73', 'Quartierstrasse'], ['quartier_ergaenzend', '#cccccc', 'Quartierstrasse ergänzend'],
      ['nicht_befahrbar', '#cd8966', 'nicht befahrbar'], ['autobahn', '#7fbfff', 'Autobahn']] },
  { id: 'strassentyp', titel: 'Strassentyp', quelle: 'Strassentypquelle nicht geladen',
    legende: [['haupt', '#dc2626', 'Hauptverkehrsstrasse'], ['verbindung', '#ea580c', 'Verbindungsstrasse'], ['sammel', '#ca8a04', 'Sammelstrasse'],
      ['quartier', '#16a34a', 'Quartier-/Erschliessungsstrasse'], ['andere', '#64748b', 'übrige']] },
  { id: 'nutzungszonen', titel: 'Nutzungszonen', quelle: 'Geoportal Stadt Bern, Nutzungszonenplan',
    legende: [['gewerbe', '#a855f7', 'Industrie- und Gewerbezone'], ['zone', '#94a3b8', 'übrige Zonen']] },
  { id: 'schulen', titel: 'Schulen, Kindergärten, Heime', quelle: 'Quelle für Schulen und Einrichtungen nicht geladen',
    legende: [['schule', '#1e40af', 'Schule', 'S'], ['kindergarten', '#0e7490', 'Kindergarten', 'K'], ['heim', '#86198f', 'Heim', 'H'], ['sozial', '#9d174d', 'soziale Einrichtung', 'E']] },
  { id: 'beleuchtung', titel: 'Beleuchtung', quelle: 'OpenStreetMap highway=street_lamp und lit',
    legende: [['lampe', '#a16207', 'Strassenlampe', 'L'], ['lit', '#fde047', 'Strasse beleuchtet (lit=yes)'], ['dunkel', '#475569', 'lit=no']] },
  { id: 'vortritt', titel: 'Vortrittszeichen', quelle: 'OpenStreetMap highway=give_way, stop, traffic_sign',
    legende: [['give_way', '#b91c1c', 'Kein Vortritt', '▽'], ['stop', '#7f1d1d', 'Stop', '■'], ['schild', '#475569', 'übriges Vortrittssignal', '◇']] },
  { id: 'steigung', titel: 'Längsneigung (Profile)', quelle: 'swissALTI3D (swisstopo), Profile der Fahrlinien',
    legende: [['n0', '#16a34a', 'bis 2 %'], ['n2', '#ca8a04', 'über 2 %'], ['n6', '#dc2626', 'über 6 %'], ['n?', '#64748b', 'nicht bestimmbar']] },
  { id: 'gelaende', titel: 'Gelände (swissALTI3D, Sichtprofile)',
    quelle: '© swisstopo; swissALTI3D, Geländeprüfung entlang der Sichtlinien; keine flächige Geländekarte',
    legende: [['frei', '#16a34a', 'im Geländemodell frei'], ['verdeckt', '#dc2626', 'im Geländemodell verdeckt'], ['bruecke', '#b45309', 'Brückenbereich: Aussage unsicher']] },
  { id: 'bruecken', titel: 'Brücken (AV-Einzelobjekte)', quelle: 'Amtliche Vermessung, Einzelobjekte (Brücke)',
    legende: [['bruecke', '#78716c', 'Brücke']] },
]

export const ebenenFarbe = (e: EbeneDef, klasse: string): string => e.legende.find(l => l[0] === klasse)?.[1] ?? '#334155'
export const ebenenSymbol = (e: EbeneDef, klasse: string): string => e.legende.find(l => l[0] === klasse)?.[3] ?? '•'

/** Menü: nur Quellen mit Daten; die übrigen nennt eine Zeile «Ohne Daten» */
export function ebenenSichtbar(daten: EbenenDaten): { zeigen: EbeneDef[]; ohne: EbeneDef[]; laedt: EbeneDef[]; fehler: EbeneDef[] } {
  const gruppen = { zeigen: [] as EbeneDef[], ohne: [] as EbeneDef[], laedt: [] as EbeneDef[], fehler: [] as EbeneDef[] }
  for (const e of EBENEN) {
    const vorhanden = Object.prototype.hasOwnProperty.call(daten, e.id)
    if (e.id === 'gelaende' && !vorhanden) continue
    const objekte = daten[e.id] ?? []
    // Gebietsfremde Quellen sind kein leerer örtlicher Bestand. Ein Metadateneintrag allein belegt nur den Ladestart.
    const regional = e.id.startsWith('regional.')
    const zh = e.id === 'zhTempo' || e.id === 'zhZonen'
    if (!objekte.length && zh && !daten.metadaten?.[e.id] && !daten.qualitaet?.[e.id]) continue
    const zustand = regional ? regionalEbenenZustand(vorhanden, objekte.length, daten.metadaten?.[e.id]) : objekte.length ? 'zeigen' : 'ohne'
    if (zustand === null) continue
    const def = { ...e, quelle: ebenenQuellenText(objekte, e.quelle, daten.qualitaet?.[e.id], daten.metadaten) }
    gruppen[zustand].push(def)
  }
  for (const gruppe of Object.values(gruppen)) gruppe.sort((a, b) => alphabetisch(a.titel, b.titel))
  return gruppen
}

const tausender = (n: number) => Math.round(n).toLocaleString('de-CH').replace(/[’']/g, ' ')
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const ohneFehler = <T extends object>(x: T | { fehler: string } | null | undefined): T | null => (x && !('fehler' in x) ? x as T : null)
const wegLinie = (w: OsmWeg): P[] => w.geom.map(([lat, lon]) => lv95(lat, lon))
const HW_KLASSE: Record<string, string> = { primary: 'haupt', secondary: 'haupt', trunk: 'haupt', tertiary: 'verbindung',
  unclassified: 'sammel', residential: 'quartier', living_street: 'quartier', service: 'andere', pedestrian: 'andere' }
const ST_KLASSE: Record<string, string> = { SS_30: 'sammel', SS_50: 'sammel', VS_50_60: 'verbindung', HVS_50_60: 'haupt', HVS_80: 'haupt' }

/** Profillinie der Längsneigung je Zufahrt (App: kurveProfilLinie und die Messung dazu) */
export interface ProfilAnzeige { key: string; linie: P[]; i: number | null; laenge: number; zufahrt: string }

/** Alle Ebenen aus den Geodaten der Vorbelegung (geoVor), den OSM-Wegen, den Profilen und den Brückenumrissen */
export function ebenenAusGeo(geo: GeoVorbelegung, wege: OsmWeg[], profile: ProfilAnzeige[] = [], bruecken: P[][] = [], baeume: readonly KatasterBaum[] = [], av: readonly import('./daten/av').AvFlaeche[] = []): EbenenDaten {
  const d: EbenenDaten = { baeume: baeume.map(b => ({ id: b.id, punkt: b.p, klasse: 'baum', text: `${b.name}; Geodaten Stadt Bern, Baumkataster` })) }
  d.av = av.filter(f => f.ringe[0]?.length >= 3).map((f,k) => ({ id: `av:${k}:${f.art}`, quelle: `Amtliche Vermessung Kanton ${f.kanton || 'unbekannt'} über geodienste.ch`, quellenSchluessel: 'av',
    ringe: f.ringe, klasse: avKlasse(f.art), text: `${f.art}; amtliche Vermessung Kanton ${f.kanton || 'unbekannt'}` }))
  for (const t of geo.regional?.teile ?? []) d[`regional.${t.id}`] = t.objekte.filter(o => ['tempo','zone'].includes(REGIONAL_DIENSTE.find(d => d.id === t.id)?.art ?? '') || !!o.kontext || !!o.verkehr || !!o.bund || !!o.bedarf).flatMap<EbenenObjekt>(o => {
    const v = o.tempo ?? (o.zone === 't30_zone' ? 30 : o.zone === 'begegnungszone' ? 20 : null)
    const basis = { id: o.id, ...(o.bund?.typ === 'unfall' ? { quelle: '© ASTRA' } : {}), klasse: o.kontext ?? (o.bedarf ? o.bedarf.art ?? 'einrichtung' : o.bund ? o.bund.typ === 'strasse' && [200, 300].includes(o.bund.code ?? 0) ? `strasse${o.bund.code}` : o.bund.typ : o.verkehr ?? (v === null ? 'offen' : tempoKlasse(v))), wert: v === null ? undefined : String(v), text: o.bund?.typ === 'unfall' ? `${o.name}; ${o.hinweis}` : `${o.name}${o.kontext || o.bund || o.bedarf ? '' : `: ${o.tempo ?? o.zone ?? 'unbekannt'}`}; ${o.hinweis}; ${o.bestaetigen ? 'Übernahme bestätigen; ' : ''}Datenstand ${t.datenstand}`, datenstand: o.stand ? `${o.stand.split('-').reverse().join('.')} (Objekt-/Exportstand)` : t.datenstand }
    return o.punkte ? o.punkte.map((punkt, i) => ({ ...basis, id: `${o.id}:${i}`, punkt })) : o.teile ? [{ ...basis, linien: o.teile }] : (o.polygone ?? []).map((ringe, i) => ({ ...basis, id: `${o.id}:${i}`, ringe, deckkraft: 0.12 }))
  })
  const zh = geo.zuerich
  const unfall = geo.regional?.teile.find(t => t.id === 'bund.unfaelle')
  for (const [id, art] of [['unfaelleFuss','fuss'],['unfaelleVelo','velo']] as const)
    d[id] = (unfall?.objekte ?? []).filter(o => o.bund?.[art]).flatMap(o => (o.punkte ?? []).map((punkt,i) => ({id:`${o.id}:${i}`,punkt,klasse:'unfall',quelle:'© ASTRA',text:`${o.name}; ${o.hinweis}`,datenstand:unfall!.datenstand})))
  d.zhTempo = (zh?.tempo?.objekte ?? []).map(l => ({ id: l.id, linien: l.teile, klasse: l.tempo === null ? 'verbot' : tempoKlasse(l.tempo),
    wert: l.tempo === null ? undefined : String(l.tempo), text: `${l.name}: ${l.regime} (${l.code}); ${l.signal} ${l.ausnahmen}; Stadt Zürich; umgesetzt ${l.umgesetzt ?? 'unbekannt'}; Datenstand ${zhStandText(zh!.tempo!)}` }))
  d.zhZonen = (zh?.zonen?.objekte ?? []).flatMap(z => z.polygone.map((ringe, i) => ({ id: `${z.id}:${i}`, ringe, klasse: z.art ?? 'offen', deckkraft: 0.14,
    text: `${z.regime} «${z.name}»; Stadt Zürich; umgesetzt ${z.umgesetzt ?? 'unbekannt'}; Datenstand ${zhStandText(zh!.zonen!)}` })))
  d.npvm = (geo.npvm?.linien ?? []).filter(l => l.dtv !== null).map(l => ({ id: l.id, linien: l.teile,
    klasse: dtvKlasse(l.dtv!), wert: tausender(l.dtv!), gestrichelt: true,
    text: `DTV ${tausender(l.dtv!)} Fz/Tag, modelliert (NPVM ${geo.npvm?.bezugsjahr ?? '?'}), Strecke ${l.nr}; ` +
      `Summe beider Fahrtrichtungen je Modellstrecke; Datenstand ${npvmStandText(geo.npvm!)} (Ebene), abgerufen ${geo.npvm?.abgerufen}; Zuordnung und Übernahme bestätigen` }))
  // Tempo: amtlich (Bern), dazu OSM maxspeed gestrichelt, wo keine amtliche Linie gelesen ist
  const vsig = ohneFehler(geo.vsig)
  d.tempo = [
    ...(vsig?.linien ?? []).filter(l => l.vSig != null).map(l => ({ id: `vs:${l.id}`, quelle: 'Geoportal Stadt Bern, Signalisierte Höchstgeschwindigkeit', quellenSchluessel: 'vsig', linien: l.teile, klasse: tempoKlasse(l.vSig!),
      wert: String(l.vSig), text: `Tempo ${l.vSig} km/h${l.strasse ? `, ${l.strasse}` : ''} (Geoportal Stadt Bern)` })),
    ...(vsig?.linien.length ? [] : wege.filter(w => /^\d+$/.test(w.tags.maxspeed ?? '')).map(w => {
      const v = Number(w.tags.maxspeed)
      return { id: `osm:${w.id}`, quelle: 'OpenStreetMap maxspeed · © OpenStreetMap-Mitwirkende, ODbL (gestrichelt)', quellenSchluessel: 'osm', linien: [wegLinie(w)], klasse: tempoKlasse(v), wert: String(v), gestrichelt: true,
        text: `Tempo ${v} km/h${w.tags.name ? `, ${w.tags.name}` : ''} (OpenStreetMap maxspeed)` }
    })),
  ]
  const vd = ohneFehler(geo.verkehrsdaten)
  d.dtv = (vd?.linien ?? []).filter(l => l.dtv != null).map(l => ({ id: `vd:${l.id}`, linien: l.teile, klasse: dtvKlasse(l.dtv!),
    wert: tausender(l.dtv!), text: `DTV ≈ ${tausender(l.dtv!)}${l.strasse ? `, ${l.strasse}` : ''} (Geoportal Stadt Bern${l.stand ? `, Stand ${l.stand}` : ''})` }))
  const halt = ohneFehler(geo.haltestellen)
  d.haltestellen = (halt?.quelle === 'bav' ? [] : halt?.halte ?? []).map(h => ({ id: `h:${h.id}`, quelle: halt!.quelle === 'osm' ? 'OpenStreetMap · © OpenStreetMap-Mitwirkende, ODbL' : halt!.herkunft, quellenSchluessel: halt!.quelle === 'osm' ? 'osm' : 'haltestellen', punkt: h.p,
    klasse: h.art === 'tram' || h.art === 'bus_tram' ? 'tram' : h.art === 'bus' ? 'bus' : 'oev',
    text: `${h.art === 'tram' ? 'Tramhaltestelle' : h.art === 'bus_tram' ? 'Tram- und Bushaltestelle' : h.art === 'bus' ? 'Bushaltestelle' : 'Haltestelle'} ${h.name} (${halt!.herkunft})` }))
  const oev = ohneFehler(geo.oevLinien)
  d.bav = (geo.bav?.halte ?? []).map(h => ({ id: h.id, punkt: h.p, klasse: h.art === 'bus' ? 'bus' : 'tram', datenstand: bavDatenstandText(geo.bav!),
    text: `${h.name} (${h.art === 'bus_tram' ? 'Bus / Tram' : h.art === 'bus' ? 'Bus' : 'Tram'}; BAV ${h.nummer}); ` +
      `Haltestellenpunkt, keine Haltekante; abgerufen ${geo.bav!.abgerufen}; Datenstand ${bavDatenstandText(geo.bav!)} (Ebene)` }))
  d.oev = (oev?.linien ?? []).map(l => ({ id: `oev:${l.id}`, linien: l.teile,
    klasse: l.typ === 'tram' ? 'tram' : l.typ === 'bus' || l.typ === 'trolleybus' ? 'bus' : 'andere',
    text: `${l.typText}${l.nummer ? ` ${l.nummer}` : ''} (Geoportal Stadt Bern, ÖV-Linien)` }))
  const sh = ohneFehler(geo.strassenhierarchie)
  d.hierarchie = (sh?.hierarchie ?? []).filter(l => l.typ).map(l => ({ id: `sh:${l.id}`, linien: l.teile, klasse: l.typ!,
    text: `${l.text}${l.strasse ? `, ${l.strasse}` : ''} (Geoportal Stadt Bern)` }))
  d.strassentyp = [
    ...(sh?.typen ?? []).filter(l => l.typ).map(l => ({ id: `st:${l.id}`, quelle: 'Geoportal Stadt Bern, Strassentypen', quellenSchluessel: 'strassentypMetadaten', linien: l.teile, klasse: ST_KLASSE[l.typ!] ?? 'andere',
      text: `${l.text}${l.strasse ? `, ${l.strasse}` : ''} (Geoportal Stadt Bern, Strassentypen)` })),
    ...(sh?.typen?.length ? [] : wege.filter(w => w.tags.highway).map(w => ({ id: `hw:${w.id}`, quelle: 'OpenStreetMap highway · © OpenStreetMap-Mitwirkende, ODbL (gestrichelt)', quellenSchluessel: 'osm', linien: [wegLinie(w)],
      klasse: HW_KLASSE[w.tags.highway.replace('_link', '')] ?? 'andere', gestrichelt: true,
      text: `highway=${w.tags.highway}${w.tags.name ? `, ${w.tags.name}` : ''} (OpenStreetMap)` }))),
  ]
  const nz = ohneFehler(geo.nutzungszonen)
  d.nutzungszonen = (nz?.flaechen ?? []).map(f => ({ id: `nz:${f.id}`, ringe: f.ringe, klasse: f.gewerbe ? 'gewerbe' : 'zone', deckkraft: 0.18,
    text: `${f.text} (Geoportal Stadt Bern, Nutzungszonenplan)` }))
  const sch = ohneFehler(geo.schulen)
  d.schulen = [...(sch?.bern?.volksschulen ?? []), ...(sch?.bern?.kindergaerten ?? []), ...(sch?.bern?.weitere ?? []), ...(sch?.osm?.orte ?? [])].map(o => ({
    id: `sch:${o.id}`, quelle: o.quelle === 'geoportal' ? 'Geoportal Stadt Bern, Schulen und Einrichtungen' : 'OpenStreetMap · © OpenStreetMap-Mitwirkende, ODbL', quellenSchluessel: o.quelle === 'geoportal' ? 'schulen' : 'osm', punkt: o.p, klasse: o.art, ...(o.umriss && !o.grenzrechteck ? { ringe: [o.umriss] } : {}),
    text: `${o.wort ? `${o.wort} ` : ''}${o.name || { schule: 'Schule', kindergarten: 'Kindergarten', heim: 'Heim', sozial: 'Soziale Einrichtung' }[o.art]} (${o.quelle === 'geoportal' ? 'Geoportal Stadt Bern' : `OpenStreetMap${o.tag ? ` ${o.tag}` : ''}`}; zählt als ${{ schule: 'Schule', kindergarten: 'Kindergarten', heim: 'Heim', sozial: 'soziale Einrichtung' }[o.art]})` }))
  d.beleuchtung = [
    ...(geo.lampen?.punkte ?? []).map((p, k) => ({ id: `lampe:${k}:${Math.round(p[0])},${Math.round(p[1])}`, punkt: p, klasse: 'lampe', text: 'Strassenlampe (OpenStreetMap)' })),
    ...wege.filter(w => w.tags.lit === 'yes' || w.tags.lit === 'no').map(w => ({ id: `lit:${w.id}`, linien: [wegLinie(w)],
      klasse: w.tags.lit === 'yes' ? 'lit' : 'dunkel', text: `lit=${w.tags.lit}${w.tags.name ? `, ${w.tags.name}` : ''} (OpenStreetMap)` })),
  ]
  d.vortritt = (geo.vortritt?.zeichen ?? []).map(z => ({ id: `vt:${z.id}`, punkt: z.p, klasse: z.art,
    text: `${z.art === 'give_way' ? 'Kein Vortritt' : z.art === 'stop' ? 'Stop' : 'Vortrittssignal'}${z.richtung ? ` (Richtung ${z.richtung})` : ''} (OpenStreetMap)` }))
  d.steigung = profile.filter(p => p.linie.length >= 2).map(p => ({ id: `pr:${p.key}`, profil: true as const, linien: [p.linie], klasse: neigungKlasse(p.i),
    ...(p.i != null ? { wert: `${f1(p.i)} %` } : {}),
    text: p.i != null ? `${p.zufahrt}: Längsneigung ${f1(p.i)} % zum Streifen hin (swissALTI3D, Profil ${Math.round(p.laenge)} m)` : `${p.zufahrt}: Neigung nicht bestimmbar` }))
  d.bruecken = bruecken.filter(r => r.length >= 3).map((r, k) => ({ id: `br:${k}`, ringe: [r], klasse: 'bruecke', deckkraft: 0.35,
    text: 'Brücke (amtliche Vermessung, Einzelobjekt)' }))
  return d
}

/** Quellen und Stand auch im Objekt-Tooltip, passend zum tatsächlichen Anbieter. */
export function ebenenBeschriften(d: EbenenDaten): EbenenDaten {
  const aus: EbenenDaten = { ...d }
  for (const e of EBENEN) if (d[e.id]) aus[e.id] = d[e.id]!.map(o => ({ ...o, text: objektQuellenText({ ...o, quellenHinweis: e.quellenHinweis }, e.quelle, d.qualitaet?.[e.id], d.metadaten) }))
  return aus
}
