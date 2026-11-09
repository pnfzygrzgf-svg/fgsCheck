// ── Geländeprofil im Bericht (06.11.2026) ──
//
// Zeichnet dieselbe Profilgeometrie wie die Ansicht in der App (hoehenprofil/modell.ts, keine neue Bewertung), aber ohne Auswahl
// und ohne Aufklappen: nur die Sichtlinien, an denen das Geländemodell zu «nicht erfüllt» führt (profilWahlBericht). Alle übrigen
// geprüften Linien zeigt die App unter «Geländeprofile ansehen». Eigene Komponente statt Teil von src/hoehenprofil/, weil jener
// Ordner wortgleich in die anderen Rechner übernommen wird.

import { profilGeometrie, type HoehenProfil } from './hoehenprofil/modell'
import type { EbenenObjekt } from './quellenEbenen'
import type { ZufahrtErgebnis } from './rechner/typen'
import { erkennungAnzeige, type GelaendeStand } from './erkennungGelaende'
import { erkennungSoll } from './erkennungKarte'

const zahl = (x: number, n = 1) => x.toLocaleString('de-CH', { minimumFractionDigits: n, maximumFractionDigits: n })

/** Ziel und Fahrzeugabstand einer Profil-Kennung «gel:<Streifen>:<Zufahrt>:<Ziel>:<x>» */
const zielVon = (id: string) => id.split(':')[3] ?? ''
const xVon = (id: string) => Number(id.split(':')[4])

/** Profile einer Zufahrt, die im Bericht gezeigt werden (Nutzerentscheid 06.11.2026): nur Sichtlinien, an denen das Geländemodell zu
 *  «nicht erfüllt» führt. Wartefläche: der Status ist «verdeckt (Geländemodell)», gezeigt wird die erste verdeckte Linie. Bodenmarkierung:
 *  die Erkennungsdistanz erreicht das Soll nicht, und was sie begrenzt, ist das Gelände; gezeigt wird die Linie an der ersten verdeckten
 *  Position. Je Ziel höchstens ein Bild; freie Zufahrten und Verdeckungen durch Gebäude, Parkfelder oder Bäume haben keines. */
export function profilWahlBericht(objekte: readonly EbenenObjekt[], z: ZufahrtErgebnis, gelaende?: Readonly<Record<string, GelaendeStand>> | null): HoehenProfil[] {
  const eigene = objekte.flatMap(o => (o.hoehenprofil && o.id.startsWith(`gel:${z.fgsId}:${z.zufahrt}:`) ? [o.hoehenprofil] : []))
  const verdeckt = (ziel: string) => eigene.filter(p => zielVon(p.id) === ziel && p.sicht?.frei === false)
  const naechste = (kand: HoehenProfil[], x: number | null | undefined) => kand.reduce<HoehenProfil | null>((m, p) =>
    (!m || Math.abs(xVon(p.id) - (x ?? -Infinity)) < Math.abs(xVon(m.id) - (x ?? -Infinity)) ? p : m), null)
  const aus: HoehenProfil[] = []
  if (z.status === 'verdeckt_gelaende' || (z.sichtGelaende?.stand === 'mit' && z.sichtGelaende.abM !== null)) {
    const kand = verdeckt('warte')
    const p = naechste(kand, Math.min(...kand.map(q => xVon(q.id))))
    if (p) aus.push(p)
  }
  const e = erkennungAnzeige(z, gelaende)?.e
  if (e && e.bis === 'verdeckt' && e.hindernis?.klasse === 'gelaende' && e.wert < erkennungSoll(z) - 1e-6) {
    const kand = verdeckt('markierung')
    const p = naechste(kand, e.gelaendePruefbereich?.ersteVerdecktM ?? Math.min(...kand.map(q => xVon(q.id))))
    if (p) aus.push(p)
  }
  return aus
}

/** Höhenschnitt einer Sichtlinie als Bild mit Bildunterschrift (druckbar) */
export function ProfilBericht({ p }: { p: HoehenProfil }) {
  const g = profilGeometrie(p)
  if (!g || !p.sicht) return null
  const W = 430, H = 255, L = 58, R = 16, O = 48, U = 44
  const unterschied = g.b.h - g.a.h
  const unterschiedText = Math.abs(unterschied) < .005 ? '0.00 m' : `${unterschied > 0 ? '+' : '−'}${zahl(Math.abs(unterschied), 2)} m`
  const bodenSpanne = Math.max(...g.punkte.map(v => v.h)) - Math.min(...g.punkte.map(v => v.h))
  const dh = Math.max(2, g.maxH - g.minH)
  const minH = g.minH - dh * .12, maxH = g.maxH + dh * .12
  const x = (d: number) => L + (d - g.a.dist) / (g.b.dist - g.a.dist) * (W - L - R)
  const y = (h: number) => H - U - (h - minH) / (maxH - minH) * (H - U - O)
  const path = g.punkte.map((v, i) => `${i ? 'L' : 'M'}${x(v.dist)},${y(v.h)}`).join(' ')
  const s = p.sicht, strahl = g.strahl!
  // Überhöhung: Höhe gegenüber der Entfernung gestreckt (Zahl für die Bildunterschrift)
  const ueberhoehung = (g.b.dist - g.a.dist) / Math.max(0.01, maxH - minH) * ((H - U - O) / (W - L - R))
  const befund = p.hinweis ? 'Das Bodenprofil erlaubt hier keinen verlässlichen Nachweis der Sicht.'
    : s.frei ? 'Geländemodell: In den geprüften Stützpunkten ist diese Sichtlinie frei.' : 'Geländemodell: Der Boden verdeckt diese Sichtlinie.'
  return (
    <figure className="bericht-profil">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Höhenprofil: ${p.titel}`}>
        <text x={L} y={12} fontSize="11" fontWeight="600">Anfang → Ende: {unterschiedText}{Math.abs(unterschied) >= .005 ? unterschied > 0 ? ' (aufwärts)' : ' (abwärts)' : ' (gleich hoch)'}</text>
        <text x={L} y={27} fontSize="11">Höchster − tiefster Bodenpunkt: {zahl(bodenSpanne, 2)} m</text>
        {[0, .5, 1].map(t => { const h = minH + t * (maxH - minH); return <g key={t}>
          <line x1={L} x2={W - R} y1={y(h)} y2={y(h)} stroke="#e2e8f0" />
          <text x={L - 6} y={y(h) + 4} textAnchor="end" fontSize="11">{zahl(h)}</text>
        </g> })}
        <text x={L} y={41} fontSize="10">Höhe m ü. M.</text>
        <path d={`${path} L${x(g.b.dist)},${H - U} L${L},${H - U} Z`} fill="#e7d8be" />
        <path d={path} fill="none" stroke="#79512e" strokeWidth="2" />
        <polygon points={`${L},${y(strahl.anfang)} ${W - R},${y(strahl.ende)} ${W - R},${y(strahl.ende + s.toleranzM)} ${L},${y(strahl.anfang + s.toleranzM)}`} fill="#dbeafe" />
        <line x1={L} y1={y(strahl.anfang + s.toleranzM)} x2={W - R} y2={y(strahl.ende + s.toleranzM)} stroke="#60a5fa" strokeDasharray="4 3" />
        <line x1={L} y1={y(strahl.anfang)} x2={W - R} y2={y(strahl.ende)} stroke="#0369a1" strokeWidth="2" />
        <line x1={L} x2={L} y1={y(g.a.h)} y2={y(strahl.anfang)} stroke="#0369a1" strokeWidth="1.5" />
        <line x1={W - R} x2={W - R} y1={y(g.zielBoden)} y2={y(strahl.ende)} stroke="#0369a1" strokeWidth="1.5" />
        <text x={L + 5} y={(y(g.a.h) + y(strahl.anfang)) / 2 + 4} fill="#0369a1" fontSize="10" stroke="#fff" strokeWidth="3" paintOrder="stroke">+{zahl(s.augeM, 2)} m</text>
        <text x={W - R - 5} y={(y(g.zielBoden) + y(strahl.ende)) / 2 + 4} textAnchor="end" fill="#0369a1" fontSize="10" stroke="#fff" strokeWidth="3" paintOrder="stroke">+{zahl(s.zielM, 2)} m</text>
        <circle cx={L} cy={y(strahl.anfang)} r="4" fill="#0369a1" />
        <circle cx={W - R} cy={y(strahl.ende)} r="4" fill="#0369a1" />
        <text x={L + 5} y={y(strahl.anfang) - 8} fill="#0369a1" fontSize="11">Fahrer*innenauge</text>
        <text x={W - R - 5} y={y(strahl.ende) - 8} textAnchor="end" fill="#0369a1" fontSize="11">Ziel</text>
        {g.getroffen && <>
          <line x1={x(g.getroffen.dist)} x2={x(g.getroffen.dist)} y1={y(g.getroffen.h)} y2={y(g.getroffen.strahlH)} stroke="#dc2626" strokeWidth="3" />
          <circle cx={x(g.getroffen.dist)} cy={y(g.getroffen.h)} r="5" fill="#dc2626" />
        </>}
        {[0, .5, 1].map(t => { const d = t * (g.b.dist - g.a.dist); return <text key={t} x={x(g.a.dist + d)} y={H - U + 17} fontSize="11" textAnchor="middle">{zahl(d, 0)}</text> })}
        <text x={(L + W - R) / 2} y={H - 5} textAnchor="middle" fontSize="11">Abstand ab Auge entlang der Sichtlinie (m)</text>
      </svg>
      <figcaption className="klein">
        <b>{p.titel}.</b> {befund}{g.getroffen ? ` Bei ${zahl(g.getroffen.dist - g.a.dist)} m ab Fahrer*innenauge liegt das Gelände ` +
          `${zahl(g.getroffen.ueberM, 2)} m über dem Sichtstrahl (rote Markierung); Toleranz ${zahl(s.toleranzM, 2)} m (hellblau).` : ''}
        {p.hinweis ? ` ${p.hinweis}` : ''}
        {' '}Braun: Boden, blau: Blick vom Fahrer*innenauge ({zahl(s.augeM, 2)} m über Gelände) zum Ziel ({zahl(s.zielM, 2)} m über Gelände{s.zielBodenH !== undefined ? ' in der Mitte der Wartefläche, Annahme' : ''}).
        {g.zielAusMitte ? ` An der Ecke der Wartefläche, wo der Schnitt endet, liegt der Boden ${zahl(Math.abs(g.zielBoden - g.b.h), 2)} m ${g.b.h < g.zielBoden ? 'tiefer' : 'höher'}.` : ''}
        Höhe gegenüber der Entfernung rund {zahl(ueberhoehung, 0)}-fach gestreckt. Gebäude und Bewuchs sind im Geländeprofil nicht enthalten.
        {' '}{p.quelle}{p.datenstand ? `; Datenstand ${p.datenstand}` : ''}.
      </figcaption>
    </figure>
  )
}
