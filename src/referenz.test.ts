// ── Vergleich mit der Berner Sichtprüfung (nur lokal) ──
//
// Liest eine Referenz-Datei des Berner Projekts AUSSERHALB des Repos (Standard ../referenz_bern/referenz.json, sonst
// Umgebungsvariable FGS_REFERENZ) samt Cache (AV-WFS, Overpass, OSM-Auszug aus dem Berner Dump). Fehlt sie, wird der Test
// übersprungen; im Repo liegen keine Berner Daten.
// Zwei Läufe je Streifen:
//   A «Achse»: Streifenachse wie in Bern (p0/p1/Balkenlänge/Umriss), OSM-Stand der Berner Prüfung, AV aus dem WFS. Prüft die
//     Portierung: Abweichungen nur dort, wo Bern Daten hat, die offen fehlen.
//   B «App»:   wie in der App, Klick auf den nächsten OSM-Übergang, Streifen aus OSM + AV, OSM live (Cache).
// Ergebnis: Zusammenfassung auf der Konsole; mit FGS_REFERENZ_SCHREIBEN=1 zusätzlich ../referenz_bern/vergleich.json.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { osmParsen, type OsmDaten } from './daten/osm'
import { avParsen } from './daten/av'
import { rechneStreifen, rechneUebergang, kontextBauen, luftbildStreifen } from './rechner'
import { bildAusPixeln } from './rechner/luftbild'
import { neuerStreifen } from './rechner/streifen'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { dist, abstandStrecke, type P } from './geo'
import { flaeche } from './rechner/poly'
import type { Entfallen } from './rechner/zufahrten'
import type { VonHand } from './rechner/pruefen'
import type { Hindernis } from './rechner/hindernisse'

const DIR = process.env.FGS_REFERENZ ? resolve(process.env.FGS_REFERENZ) : resolve(__dirname, '../../referenz_bern')
const REF = join(DIR, 'referenz.json')
const da = existsSync(REF)

/* eslint-disable @typescript-eslint/no-explicit-any */
type RefZ = Record<string, any>
type RefS = Record<string, any>

const gerade = (z: { zufahrt_art?: string; art?: string }) => (z.zufahrt_art ?? z.art) !== 'abbiegend'
const winkel = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

function paaren(ref: RefZ[], app: ZufahrtErgebnis[]): [RefZ | null, ZufahrtErgebnis | null][] {
  const out: [RefZ | null, ZufahrtErgebnis | null][] = []
  const frei = new Set(app.map((_, i) => i))
  for (const r of ref) {
    const tol = gerade(r) ? 10 : 15
    let best = -1, bw = Infinity
    app.forEach((a, i) => {
      if (!frei.has(i) || gerade(a) !== gerade(r)) return
      const kenn = a.kennung === r.kennung ? -1 : 0
      const w = winkel(a.richtung, r.richtung) + kenn * 100
      if (winkel(a.richtung, r.richtung) <= tol && w < bw) { bw = w; best = i }
    })
    if (best >= 0) { frei.delete(best); out.push([r, app[best]]) } else out.push([r, null])
  }
  for (const i of frei) out.push([null, app[i]])
  return out
}

function ursacheFehlt(r: RefZ): string {
  if ((r.einbahn_quelle ?? '').startsWith('Velonetz') || String(r.netz_hinweis ?? '').includes('einbahn_velonetz'))
    return 'Berner Sonderregel (Velonetz B3/B4)'
  return ''
}

interface Zeile {
  lauf: string; fgs_id: number; zufahrt: string; app_zufahrt: string | null; befund: string[]; ursache: string[]
  bern: Record<string, unknown> | null; app: Record<string, unknown> | null
}

function vergleichen(lauf: string, s: RefS, se: StreifenErgebnis | null, voll = false): Zeile[] {
  const zeilen: Zeile[] = []
  const app = se ? se.zufahrten : []
  for (const [r, a] of paaren(s.zufahrten, app)) {
    const befund: string[] = [], ursache: string[] = []
    let spAbstand: [number, number, number] | null = null, feldApp: number | null = null
    if (r && !a) {
      befund.push('fehlt_in_app')
      const ent = se?.entfallen.find(e => (e.art === 'abbiegend') === !gerade(r) && winkel(e.richtung, r.richtung) <= (gerade(r) ? 10 : 15))
      if (ent) befund.push(`app_entfallen:${ent.grund}`)
      const u = ursacheFehlt(r)
      if (u) ursache.push(u)
    } else if (!r && a) {
      befund.push('nur_in_app')
      const ent = s.entfallen.find((e: RefZ) => (e.art === 'abbiegend') === (a.art === 'abbiegend') &&
        winkel(Number(e.richtung), a.richtung) <= (a.art === 'abbiegend' ? 15 : 10))
      if (ent) befund.push(`bern_entfallen:${ent.grund}`)
    } else if (r && a) {
      if (r.kennung && a.kennung !== r.kennung) befund.push(`kennung ${r.kennung} / ${a.kennung}`)
      if (gerade(r) && r.zufahrt_art !== a.art) {
        befund.push(`art ${r.zufahrt_art} / ${a.art}`)
        const u = ursacheFehlt(r)
        if (u) ursache.push(u)
      }
      const tempoAnders = r.tempo !== a.tempo
      if (tempoAnders) {
        befund.push(`tempo ${r.tempo} / ${a.tempo}`)
        if (['Daten', 'Daten Umkreis', 'Velonetz von Hand', 'Korrektur'].includes(r.tempo_quelle))
          ursache.push(`offene Daten fehlen (Tempo Bern: ${r.tempo_quelle})`)
      }
      if (r.sichtweite !== a.sichtweite) {
        befund.push(`sichtweite ${r.sichtweite} (${r.sichtweite_quelle}) / ${a.sichtweite} (${a.sichtweiteQuelle})`)
        if (tempoAnders) ursache.push('Sichtweite folgt dem Tempo')
      }
      if (r.kurvenradius_m != null || a.kurvenradiusM != null) {
        const rr = r.kurvenradius_m, ar = a.kurvenradiusM
        if (rr == null || ar == null || Math.abs(ar - rr) > 0.2 * rr) {
          befund.push(`radius ${rr} (${r.radius_quelle}) / ${ar} (${a.radiusQuelle})`)
          if (String(r.radius_quelle).includes('Parkfelder')) ursache.push('Berner Sonderdaten (Parkfelder im Bogen)')
        }
      }
      if (r.sichtpunkt_vom_rand_m != null && a.sichtpunktVomRandM != null &&
        Math.abs(r.sichtpunkt_vom_rand_m - a.sichtpunktVomRandM) > 0.5) {
        befund.push(`vom_rand ${r.sichtpunkt_vom_rand_m} / ${a.sichtpunktVomRandM}`)
        // Ursache «Abzüge» nur, wenn die Differenz der Lage zur Differenz der Abzüge passt (gleiches Vorzeichen, Betrag
        // zwischen einem Viertel des Abzugs und Abzug + 0,5 m; der Rest der Breite verteilt sich auf die Fahrstreifen)
        const abB = Math.max(r.park_rechts ? 1.9 : 0, r.velostreifen_rechts_m ?? 0), abA = a.abzugRechtsM ?? 0
        const dAb = abB - abA, dLage = r.sichtpunkt_vom_rand_m - a.sichtpunktVomRandM
        if (Math.abs(dAb) > 0.05 && Math.sign(dAb) === Math.sign(dLage) && Math.abs(dLage) >= 0.25 * Math.abs(dAb) &&
          Math.abs(dLage) <= Math.abs(dAb) + 0.5)
          ursache.push(`Abzüge: Bern ${r.park_rechts ? 'Parkfelder ' : ''}${(r.velostreifen_rechts_m ?? 0) > 0 ? `Velostreifen ${r.velostreifen_rechts_m} m (${r.velostreifen_quelle || 'Datensatz'})` : ''}` +
            ` / App ${a.abzugQuelle ?? 'keine'} (Abzug ${abB.toFixed(2)} / ${abA.toFixed(2)} m)`)
      } else if ((r.sichtpunkt_vom_rand_m == null) !== (a.sichtpunktVomRandM == null)) befund.push(`vom_rand ${r.sichtpunkt_vom_rand_m} / ${a.sichtpunktVomRandM}`)
      // voller Status (Läufe mit den Berner Hindernissen) bzw. ohne Parkfeld-/Baum-Anteil
      const statusB = voll ? r.status : r.status_kern, statusA = a.status
      if (statusB !== statusA) befund.push(`status ${statusB} (Bern ${r.status}) / ${statusA}`)
      // Sichtpunkte: Abstand erster/letzter Punkt
      const sp: P[] = r.sichtpunkte ?? []
      if (sp.length && a.sichtpunkte.length) {
        const d0 = dist(sp[0], a.sichtpunkte[0]), d1 = dist(sp[sp.length - 1], a.sichtpunkte[a.sichtpunkte.length - 1])
        // grösster Abstand aller Berner Sichtpunkte zur Linie der App-Sichtpunkte (und umgekehrt)
        const linie = (q: P, l: P[]) => l.length < 2 ? dist(q, l[0]) : Math.min(...l.slice(1).map((b, i) => abstandStrecke(q, l[i], b)))
        const dMax = Math.max(...sp.map(q => linie(q, a.sichtpunkte)), ...a.sichtpunkte.map(q => linie(q, sp)))
        spAbstand = [Math.round(d0 * 100) / 100, Math.round(d1 * 100) / 100, Math.round(dMax * 100) / 100]
        if (d0 > 1.0 || d1 > 1.5) befund.push(`sichtpunkte erster ${d0.toFixed(2)} m, letzter ${d1.toFixed(2)} m`)
        else if (dMax > 1.0) befund.push(`sichtpunkte grösster Abstand ${dMax.toFixed(2)} m`)
      }
      if (r.feld_m2 != null) {
        feldApp = Math.round(flaeche(a.feld) * 10) / 10
        if (Math.abs(feldApp - r.feld_m2) > Math.max(0.1 * r.feld_m2, 5)) befund.push(`sichtfeld ${r.feld_m2} / ${feldApp} m²`)
      }
    }
    zeilen.push({ lauf, fgs_id: s.fgs_id, zufahrt: r ? r.zufahrt : '', app_zufahrt: a ? a.zufahrt : null, befund, ursache,
      bern: r ? { zufahrt: r.zufahrt, art: r.zufahrt_art, tempo: r.tempo, tempo_quelle: r.tempo_quelle, sichtweite: r.sichtweite,
        sichtweite_quelle: r.sichtweite_quelle, radius: r.kurvenradius_m, radius_quelle: r.radius_quelle,
        vom_rand: r.sichtpunkt_vom_rand_m, fahrbahn: r.fahrbahn_m, park_r: r.park_rechts, velo_r: r.velostreifen_rechts_m,
        velo_quelle: r.velostreifen_quelle, status: r.status, status_kern: r.status_kern, kennung: r.kennung,
        einbahn_quelle: r.einbahn_quelle, netz_hinweis: r.netz_hinweis, lage_quelle: r.lage_quelle } : null,
      app: a ? { zufahrt: a.zufahrt, art: a.art, tempo: a.tempo, tempo_quelle: a.tempoQuelle, sichtweite: a.sichtweite,
        sichtweite_quelle: a.sichtweiteQuelle, radius: a.kurvenradiusM, radius_quelle: a.radiusQuelle, vom_rand: a.sichtpunktVomRandM,
        fahrbahn: a.fahrbahnM, abzug: a.abzugQuelle, status: a.status, kennung: a.kennung, netz_hinweis: a.netzHinweis.join(';'),
        sichtpunkte_abstand: spAbstand, feld_m2: feldApp } : null })
  }
  // entfallene Richtungen (gerade/abbiegend) mit Grund: zuerst gleiche Kennung, sonst gleiche Richtung
  const appEnt = [...(se?.entfallen ?? [])]
  for (const e of s.entfallen as RefZ[]) {
    const ab = e.art === 'abbiegend', tol = ab ? 15 : 10
    let i = appEnt.findIndex((x: Entfallen) => (x.art === 'abbiegend') === ab && x.kennung === e.kennung)
    if (i < 0) i = appEnt.findIndex((x: Entfallen) => (x.art === 'abbiegend') === ab && winkel(x.richtung, Number(e.richtung)) <= tol)
    const ae = i >= 0 ? appEnt.splice(i, 1)[0] : null
    const inApp = app.find(x => (x.art === 'abbiegend') === ab && winkel(x.richtung, Number(e.richtung)) <= tol)
    if (inApp && !ae) continue                       // schon oben als nur_in_app gezählt
    const befund: string[] = [], ursache: string[] = []
    if (!ae) befund.push('entfallen_fehlt_in_app')
    else if (ae.grund !== e.grund) befund.push(`grund ${e.grund} / ${ae.grund}`)
    if (String(e.quelle).includes('einbahn_velonetz') || String(e.quelle).startsWith('Velonetz')) ursache.push('Berner Sonderregel (Velonetz B3/B4)')
    zeilen.push({ lauf, fgs_id: s.fgs_id, zufahrt: `entfallen ${e.zufahrt}`, app_zufahrt: ae ? `entfallen ${ae.zufahrt}` : null,
      befund, ursache, bern: { grund: e.grund, quelle: e.quelle, kennung: e.kennung }, app: ae ? { grund: ae.grund, quelle: ae.quelle,
        kennung: ae.kennung } : null })
  }
  // Streifen, die der Nutzer in Bern als «kein FGS» beurteilt hat, rechnet Bern nicht (KEIN_FGS_AUSSCHLIESSEN)
  const keinFgs = (s.urteile as RefZ[]).length > 0 && (s.urteile as RefZ[])[(s.urteile as RefZ[]).length - 1].urteil === 'kein_fgs' ||
    ((s.urteile as RefZ[]).some(u => u.urteil === 'kein_fgs') && !s.zufahrten.length && !s.entfallen.length)
  if (keinFgs) for (const z of zeilen) if (!z.ursache.length) z.ursache.push('Berner Urteil «kein FGS» (Streifen in Bern nicht gerechnet)')
  return zeilen
}

const echtB = (z: Zeile) => z.befund.filter(b => !b.startsWith('app_streifen')).length > 0

function lesen(p: string): any | null { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null }

describe.skipIf(!da)('Referenz Bern (nur lokal)', () => {
  it('rechnet die Referenzstreifen und schreibt vergleich.json', () => {
    const ref = JSON.parse(readFileSync(REF, 'utf-8'))
    const nur = process.env.FGS_NUR ? process.env.FGS_NUR.split(',').map(Number) : null
    const zeilen: Zeile[] = []
    const fehler: string[] = []
    const geometrie: Record<string, unknown>[] = []
    for (const s of ref.streifen as RefS[]) {
      if (nur && !nur.includes(s.fgs_id)) continue
      const av0 = lesen(join(DIR, 'cache', `av_${s.fgs_id}.json`))
      const netzRoh = lesen(join(DIR, 'cache', `netz_${s.fgs_id}.json`))
      const osmRoh = lesen(join(DIR, 'cache', `osm_${s.fgs_id}.json`))
      if (!av0) { fehler.push(`Nr. ${s.fgs_id}: AV-Cache fehlt`); continue }
      const av = avParsen(av0)
      // Berner Hindernisse (Parkfelder, Bäume) als Eingabe «von Hand» (Lauf A und B); AV-Einzelobjekte (Brückenumriss)
      const hRoh = lesen(join(DIR, 'cache', `hindernisse_${s.fgs_id}.json`))
      const hind: Hindernis[] = hRoh ? [
        ...(hRoh.felder as RefZ[]).filter(f => f.ring.length >= 3).map(f => ({ id: f.id, art: 'parkfeld' as const,
          klasse: f.klasse, ring: f.ring, quelle: 'kataster' as const, name: f.layer })),
        ...(hRoh.baeume as RefZ[]).map(b => ({ id: b.id, art: 'baum' as const, p: b.p, stamm: 0.5, quelle: 'kataster' as const })),
      ] : []
      const sosfRoh = lesen(join(DIR, 'cache', `sosf_${s.fgs_id}.json`))
      const sosf = sosfRoh ? avParsen(sosfRoh) : []
      // Lauf A: Achse wie in Bern, OSM wie in Bern, Tempo und Abzüge wie in Bern als Eingabe «von Hand» (prüft die
      // Portierung); Lauf A0: dasselbe mit offenen Daten (Tempo aus OSM, Abzüge aus OSM-Tags)
      if (netzRoh) {
        const osm: OsmDaten = osmParsen(netzRoh)
        const S = () => (s.nachbarn as RefS[]).map(x => neuerStreifen(String(x.fgs_id), String(x.uebergang_id), x.p0, x.p1, x.bw,
          x.quelle, x.umriss, x.schraeg))
        const zeileBern = (fid: string, art: string, grad: number): RefZ | null => {
          if (fid !== String(s.fgs_id)) return null
          const ab = art === 'abbiegend'
          return (s.zufahrten as RefZ[]).find(z => (z.zufahrt_art === 'abbiegend') === ab && winkel(z.richtung, grad) <= (ab ? 15 : 10)) ?? null
        }
        const vonHand: VonHand = {
          tempo: (fid, art, grad) => zeileBern(fid, art, grad)?.tempo ?? null,
          abzug: (fid, art, grad) => {
            const z = zeileBern(fid, art, grad)
            if (!z || z.park_rechts == null) return null
            // Parkstreifen aus den Berner Parkfeldern (Hindernisse), hier nur die Velostreifen-Linie (ab Bordkante)
            return { r: { park: 0, velo: z.velostreifen_rechts_m ?? 0 }, l: { park: 0, velo: z.velostreifen_links_m ?? 0 } }
          },
        }
        for (const [lauf, vh] of [['A', vonHand], ['A0', undefined]] as [string, VonHand | undefined][]) {
          try {
            const k = kontextBauen(osm, av, sosf, lauf === 'A' ? hind : [])
            k.vonHand = vh
            const r = rechneStreifen(osm, av, S(), k)
            const se = r.streifen.find(x => x.fgsId === String(s.fgs_id)) ?? null
            const neu = vergleichen(lauf, s, se, lauf === 'A')
            if (lauf === 'A0') {
              // A0 unterscheidet sich von A nur durch Tempo und Abzüge aus OSM statt Bern: ist dieselbe Zufahrt in A ohne
              // Abweichung, ist das die Ursache (Grössenprüfung durch die Rechnung selbst)
              const gleichA = new Set(zeilen.filter(z => z.lauf === 'A' && z.fgs_id === s.fgs_id && !echtB(z)).map(z => z.zufahrt))
              for (const z of neu) if (echtB(z) && z.zufahrt && gleichA.has(z.zufahrt))
                z.ursache = ['offene Daten fehlen: Tempo bzw. Abzüge aus OSM statt Bern; mit den Berner Werten (Lauf A) gleich']
            }
            zeilen.push(...neu)
          } catch (e) { fehler.push(`Nr. ${s.fgs_id} Lauf ${lauf}: ${(e as Error).stack}`) }
        }
      }
      // Lauf B: wie die App (Streifen aus OSM + AV); Lauf B2 («B'», E3): zuerst das Luftbild (Ausschnitt aus cache_luftbild/),
      // nur bei «erkannt» übernommen, sonst wie B
      if (osmRoh && s.osm_knoten) {
        const osm: OsmDaten = osmParsen(osmRoh)
        const m: P = s.mitte
        const lbMeta = lesen(join(DIR, 'cache_luftbild', `${s.fgs_id}.json`))
        const lbPfad = join(DIR, 'cache_luftbild', `${s.fgs_id}.rgb`)
        for (const lauf of ['B', 'B2']) {
          if (lauf === 'B2' && (!lbMeta || !existsSync(lbPfad))) { fehler.push(`Nr. ${s.fgs_id}: Luftbild-Cache fehlt`); continue }
          try {
            const k = kontextBauen(osm, av, sosf, hind)
            // nächster Übergangsknoten (wie ein Klick) zur Streifenmitte
            let nid = s.osm_knoten.id, bd = Infinity
            for (const [id, u] of k.netz!.U) { const dd = dist(u.p, m); if (dd < bd) { bd = dd; nid = id } }
            let r = rechneUebergang(osm, av, nid, k)
            let quelle = 'osm_av', erk: Record<string, unknown> | null = null
            if (lauf === 'B2') {
              const t0 = performance.now()
              const bild = bildAusPixeln(readFileSync(lbPfad), lbMeta.px, lbMeta.px, lbMeta.box, 3)
              const lb = luftbildStreifen(osm, k, nid, bild)
              const e = lb.erkennung
              erk = { befund: e.befund, gruende: e.gruende, ncc: e.ncc, kontrast: e.kontrast, abstand: e.abstandM, teile: e.teile.length,
                ms: Math.round(performance.now() - t0), ms_erkennung: Math.round(e.ms), bytes: lbMeta.bytes, flugjahr: lbMeta.flugjahr }
              if (e.befund === 'erkannt' && lb.streifen.length) {
                const k2 = kontextBauen(osm, av, sosf, hind)
                r = rechneStreifen(osm, av, lb.streifen, k2)
                quelle = 'luftbild'
              }
            }
            // Zuordnung: jeder App-Teilstreifen gehört zum nächsten Berner Streifen (Nachbarn); für diesen Streifen der nächste
            // davon, sonst der nächste überhaupt
            const mitteVon = (x: RefS): P => [(x.p0[0] + x.p1[0]) / 2, (x.p0[1] + x.p1[1]) / 2]
            const eigen = r.streifen.filter(x => {
              const nb = (s.nachbarn as RefS[]).reduce((b, y) => (dist(mitteVon(y), x.m) < dist(mitteVon(b), x.m) ? y : b))
              return nb.fgs_id === s.fgs_id
            })
            const kand = eigen.length ? eigen : r.streifen
            const se = kand.reduce<StreifenErgebnis | null>((b, x) => (b === null || dist(x.m, m) < dist(b.m, m) ? x : b), null)
            const z = vergleichen(lauf, s, se, true)
            if (se) for (const x of z) x.befund.push(`app_streifen ${se.fgsId} ${dist(se.m, m).toFixed(1)} m neben Bern`)
            zeilen.push(...z)
            // Lage des Streifens gegenüber Bern: Mitte, Achse (Winkel), Länge, Balkenlänge
            if (se) {
              const ab = (a: P, b: P) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
              const dw = Math.abs(((ab(se.p0, se.p1) - ab(s.p0, s.p1)) % 180 + 270) % 180 - 90)
              geometrie.push({ lauf, fgs_id: s.fgs_id, quelle, d_mitte: Math.round(dist(se.m, m) * 100) / 100,
                d_winkel: Math.round(dw * 10) / 10, d_laenge: Math.round((dist(se.p0, se.p1) - dist(s.p0, s.p1)) * 100) / 100,
                d_bw: Math.round((se.bw - s.bw) * 100) / 100, erkennung: erk })
            } else geometrie.push({ lauf, fgs_id: s.fgs_id, quelle, d_mitte: null, erkennung: erk })
          } catch (e) { fehler.push(`Nr. ${s.fgs_id} Lauf ${lauf}: ${(e as Error).stack}`) }
        }
      }
    }
    // Ursachen von Hand (Durchsicht, Datei ausserhalb des Repos): {"A:fgs_id:zufahrt": "Ursache"}
    const handUrsachen: Record<string, string> = lesen(join(DIR, 'ursachen.json')) ?? {}
    const echt = (z: Zeile) => z.befund.filter(b => !b.startsWith('app_streifen')).length > 0
    for (const z of zeilen) {
      const u = handUrsachen[`${z.lauf}:${z.fgs_id}:${z.zufahrt || z.app_zufahrt}`]
      if (u && echt(z)) z.ursache.push(u)
    }
    // vergleich.json nur auf Wunsch schreiben (FGS_REFERENZ_SCHREIBEN=1), nicht bei jedem npm test
    if (process.env.FGS_REFERENZ_SCHREIBEN)
      writeFileSync(join(DIR, nur ? 'vergleich_teil.json' : 'vergleich.json'), JSON.stringify({ zeilen, fehler, geometrie }, null, 1))
    const offen: Record<string, number> = {}
    for (const lauf of ['A', 'A0', 'B', 'B2']) {
      const z = zeilen.filter(x => x.lauf === lauf && !x.zufahrt.startsWith('entfallen'))
      const e = zeilen.filter(x => x.lauf === lauf && x.zufahrt.startsWith('entfallen'))
      offen[lauf] = zeilen.filter(x => x.lauf === lauf && echt(x) && !x.ursache.length).length
      console.log(`Lauf ${lauf}: ${z.length} Zufahrten, ${z.filter(x => !echt(x)).length} ohne Abweichung; ` +
        `${e.length} entfallene, ${e.filter(x => !echt(x)).length} gleich; ohne Ursache ${offen[lauf]}`)
    }
    if (fehler.length) console.log(fehler.join('\n'))
    expect(fehler.filter(f => !f.includes('Cache fehlt'))).toEqual([])
    for (const lauf of ['B', 'B2']) {
      const g = geometrie.filter(x => x.lauf === lauf && x.d_mitte != null) as { d_mitte: number; d_winkel: number; d_bw: number; d_laenge: number }[]
      const q = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN }
      console.log(`Lage ${lauf}: ${g.length} Streifen, Mitte ≤ 1 m: ${g.filter(x => x.d_mitte <= 1).length}, Median Mitte ${q(g.map(x => x.d_mitte))} m, ` +
        `Winkel ≤ 5°: ${g.filter(x => x.d_winkel <= 5).length}, |Δ Balkenlänge| ≤ 0,5 m: ${g.filter(x => Math.abs(x.d_bw) <= 0.5).length}, |Δ Länge| ≤ 1 m: ${g.filter(x => Math.abs(x.d_laenge) <= 1).length}`)
    }
    const lb = geometrie.filter(x => x.lauf === 'B2').map(x => x.erkennung as Record<string, number | string>)
    console.log('Erkennung B2: ' + JSON.stringify(lb.reduce((a: Record<string, number>, e) => { a[String(e.befund)] = (a[String(e.befund)] ?? 0) + 1; return a }, {})) +
      `, ms Median ${[...lb.map(e => Number(e.ms_erkennung))].sort((a, b) => a - b)[Math.floor(lb.length / 2)]}`)
    // Portierungsprüfung: im Lauf A darf keine Abweichung ohne zugeordnete Ursache bleiben (nur mit Durchsicht-Datei)
    if (Object.keys(handUrsachen).length && !nur) expect(offen.A).toBe(0)
  }, 600000)
})
