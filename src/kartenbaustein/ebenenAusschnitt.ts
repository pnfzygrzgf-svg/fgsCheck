// ── Ebenen, die ein Rechner selbst im Kartenausschnitt lädt ──
// Eine Ebene ist hier nur eine Beschreibung, Laden und Stand sind für alle gleich. Eine Ebene des Bundes nennt ihren Layer, eine andere bringt mit laden() ihre Abfrage mit.

import { useEffect, useState } from 'react'
import type L from 'leaflet'
import { ausschnittBox, ladeBundAusschnitt, type BundTreffer } from './bund'
import { lv95 } from './projektion'
import type { KartenObjekt, LegendenEintrag, P } from './modell'

export const AUSSCHNITT_ZOOM = 17
export const AUSSCHNITT_HINWEIS = `Lädt den Kartenausschnitt ab Zoomstufe ${AUSSCHNITT_ZOOM}.`

const PAUSE_MS = 300

interface Ebene { id: string; titel: string; quelle: string; legende: readonly LegendenEintrag[] }
export interface BundEbene extends Ebene { layer: string; lesen: (f: BundTreffer) => KartenObjekt[] }
/** box: Rechteck um den Ausschnitt in LV95, siehe ausschnittKreis */
export interface EigeneEbene<O extends KartenObjekt = KartenObjekt> extends Ebene { laden: (box: string, signal: AbortSignal) => Promise<O[]> }
export type AusschnittEbene = BundEbene | EigeneEbene

/** Mitte und halbe Kante des Rechtecks: Die Dienste der Orte fragen um einen Punkt */
export function ausschnittKreis(box: string): { mitte: P; r: number } {
  const [w, s, o, n] = box.split(',').map(Number)
  return { mitte: [(w + o) / 2, (s + n) / 2], r: Math.ceil(Math.max(o - w, n - s) / 2) }
}

const istPunkt = (c: unknown): c is P => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
const linienVon = (g: BundTreffer['geometry']): P[][] => (g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' && Array.isArray(g.coordinates) ? g.coordinates : [])
  .map(l => (Array.isArray(l) ? l.filter(istPunkt).map(p => [p[0], p[1]] as P) : [])).filter(l => l.length >= 2)
const flaechenVon = (g: BundTreffer['geometry']): P[][][] => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' && Array.isArray(g.coordinates) ? g.coordinates : [])
  .map(f => (Array.isArray(f) ? f.map(r => (Array.isArray(r) ? r.filter(istPunkt).map(p => [p[0], p[1]] as P) : [])).filter(r => r.length >= 4) : [])).filter(f => f.length > 0)
const nummerVon = (f: BundTreffer) => String(f.featureId ?? f.id ?? '')
const zahlVon = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const tausender = (n: number) => Math.round(n).toLocaleString('de-CH').replace(/[’']/g, ' ')

/** Stufen des DTV, gleich wie im VeloroutenCheck */
export const DTV_STUFEN: readonly LegendenEintrag[] = [['d2', '#16a34a', 'bis 2 000'], ['d5', '#ca8a04', '2 000–5 000'], ['d10', '#ea580c', '5 000–10 000'], ['d20', '#dc2626', '10 000–20 000'], ['d99', '#7f1d1d', 'über 20 000']]
export const dtvStufe = (v: number): string => (v <= 2000 ? 'd2' : v <= 5000 ? 'd5' : v <= 10000 ? 'd10' : v <= 20000 ? 'd20' : 'd99')
export const dtvWert = tausender

export const HALTESTELLEN_BAV: BundEbene = {
  id: 'bav', titel: 'Haltestellen BAV', layer: 'ch.bav.haltestellen-oev', quelle: '© BAV; Haltestellen und Haltekanten; nur Karte, keine Wirkung auf die Rechnung',
  legende: [['tram', '#b91c1c', 'Tram', 'T'], ['bus', '#1d4ed8', 'Bus', 'B'], ['bus_tram', '#7c3aed', 'Bus und Tram', 'H'], ['kante', '#475569', 'Haltekante, auch Bahn', 'K']],
  lesen(f) {
    const p = f.properties ?? {}, verkehr = String(p.verkehrsmittel_de ?? ''), nummer = String(f.featureId ?? f.id ?? '')
    if (typeof p.haltestelle === 'string' && typeof p.nummer_text === 'string') {
      const lage = (f.geometry?.type === 'Point' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPoint' && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : []).find(istPunkt)
      return lage ? [{ id: `bav:k:${nummer || p.nummer_text}`, punkt: [lage[0], lage[1]] as P, klasse: 'kante', text: `${p.haltestelle}${p.bezeichnung_de ? `, Kante ${String(p.bezeichnung_de)}` : ''}: BAV ${p.nummer_text}` }] : []
    }
    const bus = /\b(bus|trolleybus)\b/i.test(verkehr), tram = /\btram\b/i.test(verkehr), g = f.geometry
    if (p.betriebspunkttyp_de !== 'Haltestelle' || (!bus && !tram) || !nummer) return []
    // Der Dienst liefert Haltestellen als Punkt oder als MultiPoint
    const punkte = (g?.type === 'Point' ? [g.coordinates] : g?.type === 'MultiPoint' && Array.isArray(g.coordinates) ? g.coordinates : []).filter(istPunkt)
    return punkte.map((c, i) => ({ id: `bav:${nummer}${punkte.length > 1 ? `:${i}` : ''}`, punkt: [c[0], c[1]] as P, klasse: bus && tram ? 'bus_tram' : bus ? 'bus' : 'tram',
      text: `${String(p.name ?? 'Haltestelle')}: BAV ${nummer}; Haltestellenpunkt` }))
  },
}

export const TRAMGLEISE_TLM: BundEbene = {
  id: 'tramTlm', titel: 'Tramgleise (swissTLM3D)', layer: 'ch.swisstopo.swisstlm3d-eisenbahnnetz', quelle: '© swisstopo; swissTLM3D; nur Karte, keine Wirkung auf die Rechnung',
  legende: [['tram', '#dc2626', 'Tramgleis']],
  lesen(f) {
    const p = f.properties ?? {}, linien = linienVon(f.geometry), nummer = nummerVon(f)
    if (p.verkehrsmittel !== 200 || p.ausser_betrieb !== 1 || !linien.length || !nummer) return []
    return [{ id: `tlm.tram:${nummer}`, linien, klasse: 'tram', text: 'Tramgleis (swissTLM3D); Höhenlage und Lage zur Fahrbahn prüfen' }]
  },
}

export const STRASSENKLASSEN_TLM: BundEbene = {
  id: 'strasseTlm', titel: 'Strassenklassen (swissTLM3D)', layer: 'ch.swisstopo.swisstlm3d-strassen', quelle: '© swisstopo; swissTLM3D, Verkehrsbedeutung; nur Karte, keine Wirkung auf die Rechnung',
  legende: [['strasse200', '#dc2626', 'Durchgangsstrasse'], ['strasse300', '#eab308', 'Verbindungsstrasse'], ['strasse', '#64748b', 'Verkehrsbedeutung unbekannt']],
  lesen(f) {
    const p = f.properties ?? {}, linien = linienVon(f.geometry), nummer = nummerVon(f), name = typeof p.strassenname === 'string' ? p.strassenname.trim() : ''
    if (!linien.length || !nummer) return []
    const art = p.verkehrsbedeutung === 200 ? 'Durchgangsstrasse' : p.verkehrsbedeutung === 300 ? 'Verbindungsstrasse' : 'Verkehrsbedeutung unbekannt'
    return [{ id: `tlm.strasse:${nummer}`, linien, klasse: p.verkehrsbedeutung === 200 ? 'strasse200' : p.verkehrsbedeutung === 300 ? 'strasse300' : 'strasse', text: `${name ? `${name}: ` : ''}${art} (swissTLM3D)` }]
  },
}

export const BAUZONEN: BundEbene = {
  id: 'bauzonen', titel: 'Bauzonen Schweiz (ARE)', layer: 'ch.are.bauzonen', quelle: '© ARE und Kantone; harmonisierte Bauzonen; nur Karte, keine Wirkung auf die Rechnung',
  legende: [['bauzone', '#a855f7', 'Bauzone']],
  lesen(f) {
    const p = f.properties ?? {}, nummer = nummerVon(f), name = typeof p.ch_bez_d === 'string' ? p.ch_bez_d.trim() : ''
    if (!nummer) return []
    return flaechenVon(f.geometry).map((ringe, i) => ({ id: `bauzonen:${nummer}:${i}`, ringe, klasse: 'bauzone', deckkraft: 0.12, text: `${name || 'Bauzone'}; kein Nachweis der Innerortslage` }))
  },
}

export interface NpvmWerte { dtv: number | null; dwv?: number | null; msp?: number | null; asp?: number | null; lw?: number | null; lz?: number | null }
/** Angaben einer Modellstrecke für Tooltip und Fenster, in allen Rechnern gleich. Alle Werte sind die Summe beider Richtungen, geprüft am Originalexport des NPVM (Zenodo 23009199,
 *  55 Strecken). Bei getrennten Fahrbahnen ist eine Linie nur eine Richtung, der ganze Querschnitt sind zwei Linien */
export function npvmWerteText(w: NpvmWerte): string {
  const zahl = (v: number | null | undefined) => (v === null || v === undefined ? null : tausender(v))
  const tag = [zahl(w.dtv) && `DTV ${zahl(w.dtv)}`, zahl(w.dwv) && `DWV ${zahl(w.dwv)}`].filter(Boolean).join(', ')
  const spitzen = [zahl(w.msp) && `Morgenspitze ${zahl(w.msp)}`, zahl(w.asp) && `Abendspitze ${zahl(w.asp)}`].filter(Boolean).join(', ')
  const schwer = w.lw === null || w.lw === undefined || w.lz === null || w.lz === undefined ? '' : `Schwerverkehr ${tausender(w.lw + w.lz)} Fahrzeuge je Tag (Lastwagen ${tausender(w.lw)}, Lastzüge ${tausender(w.lz)})`
  return [tag && `${tag} Fahrzeuge je Tag`, spitzen && `${spitzen} Fahrzeuge je Stunde`, schwer, 'beide Richtungen, bei getrennten Fahrbahnen je Fahrbahn; modelliert (NPVM)'].filter(Boolean).join('; ')
}

export const VERKEHRSMODELL_NPVM: BundEbene = {
  id: 'npvm', titel: 'Verkehrsmenge (NPVM, modelliert)', layer: 'ch.are.belastung-personenverkehr-strasse',
  quelle: '© ARE, Nationales Personenverkehrsmodell (NPVM); Modellwerte, keine Verkehrszählung; nur Karte, keine Wirkung auf die Rechnung', legende: DTV_STUFEN,
  lesen(f) {
    const p = f.properties ?? {}, linien = linienVon(f.geometry), nummer = nummerVon(f), dtv = zahlVon(p.dtv_fzg)
    if (dtv === null || !linien.length || !nummer) return []
    return [{ id: `npvm:${nummer}`, linien, klasse: dtvStufe(dtv), wert: tausender(dtv), text: npvmWerteText({ dtv, dwv: zahlVon(p.dwv_fzg), msp: zahlVon(p.msp_fzg), asp: zahlVon(p.asp_fzg), lw: zahlVon(p.dtv_lw), lz: zahlVon(p.dtv_lz) }) }]
  },
}

const holen = (e: AusschnittEbene, box: string, signal: AbortSignal): Promise<KartenObjekt[]> =>
  ('laden' in e ? e.laden(box, signal) : ladeBundAusschnitt(e.layer, box, signal).then(r => r.flatMap(e.lesen)))

const BERN_HALT = 'https://map.bern.ch/arcgis/rest/services/Geoportal/Haltestellen/MapServer/0/query'
/** Rechteck um die Stadt Bern: Ausserhalb geht keine Abfrage an die Stadt */
const BERN_RECHTECK = [2588000, 1196000, 2605000, 1205000]
const trifftBern = (box: string) => { const [w, s, o, n] = box.split(',').map(Number); return o >= BERN_RECHTECK[0] && w <= BERN_RECHTECK[2] && n >= BERN_RECHTECK[1] && s <= BERN_RECHTECK[3] }

export const haltestellenBernUrl = (box: string) => `${BERN_HALT}?${new URLSearchParams({ geometry: box, geometryType: 'esriGeometryEnvelope', inSR: '2056',
  spatialRel: 'esriSpatialRelIntersects', outFields: 'Objectid,Punktname,Rubrik,Kante', outSR: '2056', f: 'geojson' })}`

interface BernHalte {
  crs?: { properties?: { name?: string } }
  error?: { code?: number; message?: string }
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
  features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[]
}

/** Je Haltekante ein Punkt; Stationen der Drahtseilbahn zählen nicht. Eine fehlerhafte oder gekappte Antwort wirft: lieber keine Punkte als zu wenige */
export function haltestellenBernLesen(gj: BernHalte): KartenObjekt[] {
  if (gj.error) throw new Error(`ArcGIS ${gj.error.code ?? ''} ${gj.error.message ?? ''}`.trim())
  if (gj.exceededTransferLimit || gj.properties?.exceededTransferLimit) throw new Error('Antwort unvollständig (Übertragungsgrenze des Dienstes)')
  if (!/(^|[^0-9])2056$/.test(gj.crs?.properties?.name ?? '')) throw new Error('Antwort nicht in LV95 (EPSG:2056)')
  return (gj.features ?? []).flatMap((f, i) => {
    const g = f.geometry, p = f.properties ?? {}
    if (g?.type !== 'Point' || !istPunkt(g.coordinates) || (typeof p.Rubrik === 'string' && /drahtseil/i.test(p.Rubrik))) return []
    const name = typeof p.Punktname === 'string' && p.Punktname.trim() ? p.Punktname.trim() : 'ohne Namen', kante = typeof p.Kante === 'string' ? p.Kante.trim() : ''
    return [{ id: `bernhst:${String(p.Objectid ?? i)}`, punkt: [g.coordinates[0], g.coordinates[1]] as P, klasse: 'oev', text: `${name}${kante ? `, Kante ${kante}` : ''} (Geoportal Stadt Bern)` }]
  })
}

export const HALTESTELLEN_BERN: EigeneEbene = {
  id: 'haltestellen', titel: 'ÖV-Haltestellen (Stadt Bern)', quelle: 'Geoportal Stadt Bern, Haltestellen; je Haltekante ein Punkt; nur Karte, keine Wirkung auf die Rechnung',
  legende: [['oev', '#475569', 'Haltekante', 'H']],
  async laden(box, signal) {
    if (!trifftBern(box)) return []
    const r = await fetch(haltestellenBernUrl(box), { signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return haltestellenBernLesen(await r.json() as BernHalte)
  },
}

/** Lädt nach jeder Kartenbewegung die eingeschalteten Ebenen; je Ebene ganz oder gar nicht */
export function useBundEbenen(map: L.Map | null, ebenen: readonly AusschnittEbene[]) {
  const [objekte, setObjekte] = useState<Record<string, KartenObjekt[]>>({})
  const [stand, setStand] = useState<Record<string, string>>({})
  const schluessel = ebenen.map(e => e.id).join()
  useEffect(() => {
    if (!map || !ebenen.length) return
    let ctrl: AbortController | null = null, uhr: ReturnType<typeof setTimeout> | undefined
    const laden = () => {
      if (map.getZoom() < AUSSCHNITT_ZOOM) { setStand({}); return }
      const b = map.getBounds(), c = new AbortController()
      const box = ausschnittBox([b.getSouthWest(), b.getSouthEast(), b.getNorthEast(), b.getNorthWest()].map(x => lv95(x.lat, x.lng)))
      ctrl = c
      setStand(Object.fromEntries(ebenen.map(e => [e.id, 'wird geladen …'])))
      for (const e of ebenen) void holen(e, box, c.signal).then(liste => {
        if (c.signal.aborted) return
        setObjekte(v => ({ ...v, [e.id]: liste }))
        setStand(v => ({ ...v, [e.id]: `${liste.length.toLocaleString('de-CH')} im Ausschnitt` }))
      }, () => { if (!c.signal.aborted) setStand(v => ({ ...v, [e.id]: 'nicht geladen' })) })
    }
    // Die Pause erspart Abfragen, solange die Karte noch gezogen wird
    const bewegt = () => { ctrl?.abort(); ctrl = null; setObjekte({}); clearTimeout(uhr); uhr = setTimeout(laden, PAUSE_MS) }
    bewegt(); map.on('moveend', bewegt)
    return () => { ctrl?.abort(); clearTimeout(uhr); map.off('moveend', bewegt); setObjekte({}); setStand({}) }
    // ebenen ist je Darstellung neu, schluessel steht für ihren Inhalt
  }, [map, schluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  return { objekte, stand }
}
