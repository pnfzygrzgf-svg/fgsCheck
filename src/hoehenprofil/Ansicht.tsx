import { useId, useState, type ReactNode } from 'react'
import { profilGeometrie, profilGruppen, standardProfil, type HoehenProfil } from './modell'

const zahl = (x: number, n = 1) => x.toLocaleString('de-CH', { minimumFractionDigits: n, maximumFractionDigits: n })

/** Ein gemeinsamer Rahmen für Gelände-Schalter, Herkunft, Legende und zugehörige Profile. */
export function EbenenGruppe({ mitProfil, titel, children }: { mitProfil: boolean; titel: string; children: ReactNode }) {
  return <div role={mitProfil ? 'group' : undefined} aria-label={mitProfil ? titel : undefined}
    data-profil-ebene={mitProfil ? 'true' : undefined}
    style={mitProfil ? { margin: '6px 0', padding: '0 7px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc' } : undefined}>
    {children}
  </div>
}

export function HoehenprofilAnsicht({ profile, onAuswahl, kartenAlle = false, onKartenAlle }: {
  profile: readonly HoehenProfil[]; onAuswahl?: (id: string | null) => void; kartenAlle?: boolean; onKartenAlle?: (an: boolean) => void
}) {
  const [wahl, setWahl] = useState(''), [offen, setOffen] = useState(false)
  const id = useId(), p = standardProfil(profile, wahl)
  if (!p) return <p style={{ fontSize: 12 }}>Noch keine Höhenprofile verfügbar.</p>
  const gruppen = profilGruppen(profile), gruppiert = profile.some(p => p.gruppe)
  const gruppe = gruppen.find(g => g.profile.some(x => x.id === p.id))!
  const waehlen = (id: string) => { setWahl(id); if (offen) onAuswahl?.(id) }
  const g = profilGeometrie(p)
  const W = 430, H = 255, L = 58, R = 16, O = 48, U = 44
  const unterschied = g ? g.b.h - g.a.h : 0
  const unterschiedText = Math.abs(unterschied) < .005 ? '0.00 m' : `${unterschied > 0 ? '+' : '−'}${zahl(Math.abs(unterschied), 2)} m`
  // Nur der Boden: Augenhöhe, Zielhöhe und Sichttoleranz sind kein Geländerelief.
  const bodenSpanne = g ? Math.max(...g.punkte.map(v => v.h)) - Math.min(...g.punkte.map(v => v.h)) : 0
  const dh = g ? Math.max(2, g.maxH - g.minH) : 2
  const minH = g ? g.minH - dh * .12 : 0, maxH = g ? g.maxH + dh * .12 : 1
  const x = (d: number) => L + (d - g!.a.dist) / (g!.b.dist - g!.a.dist) * (W - L - R)
  const y = (h: number) => H - U - (h - minH) / (maxH - minH) * (H - U - O)
  const path = g?.punkte.map((v, i) => `${i ? 'L' : 'M'}${x(v.dist)},${y(v.h)}`).join(' ')
  return <details style={{ margin: '0 0 0 26px', fontSize: 12, color: '#172033', borderTop: '1px solid #cbd5e1', padding: '8px 0' }}
    onToggle={e => { if (e.target !== e.currentTarget) return; const an = e.currentTarget.open; setOffen(an); onAuswahl?.(an ? p.id : null) }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Geländeprofile ansehen ({profile.length})</summary>
    {gruppiert && <>
      <label htmlFor={`${id}-zufahrt`} style={{ display: 'block', marginTop: 8 }}>Zufahrt wählen</label>
      <select id={`${id}-zufahrt`} value={gruppe.id} style={{ width: '100%', font: 'inherit', padding: 5 }} onChange={e => {
        const neu = standardProfil(gruppen.find(g => g.id === e.target.value)?.profile ?? [])
        if (neu) waehlen(neu.id)
      }}>{gruppen.map(g => <option key={g.id} value={g.id}>{g.titel}</option>)}</select>
    </>}
    <label htmlFor={id} style={{ display: 'block', marginTop: 8 }}>{gruppiert ? 'Sichtlinie wählen' : 'Profilstrecke wählen'}</label>
    <select id={id} value={p.id} style={{ width: '100%', font: 'inherit', padding: 5 }} onChange={e => waehlen(e.target.value)}>
      {(gruppiert ? gruppe.profile : profile).map(p => <option key={p.id} value={p.id}>{p.auswahlText ?? p.titel}</option>)}
    </select>
    <p style={{ margin: '7px 0', fontWeight: 600 }}>{p.titel}</p>
    {onKartenAlle && <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
      <input type="checkbox" checked={kartenAlle} onChange={e => onKartenAlle(e.target.checked)} />Alle {profile.length} Linien auf der Karte
    </label>}
    {p.sicht && <p style={{ margin: '7px 0' }}>Eine Linie steht für eine Fahrzeugposition und ein Ziel. Auf der Karte sind Fahrer*innenauge und Ziel beschriftet.</p>}
    <p style={{ margin: '7px 0' }}>{p.zweck}</p>
    {p.hinweis && <p role="note" style={{ padding: 7, background: '#fef3c7', borderLeft: '3px solid #b45309' }}>{p.hinweis}</p>}
    {g ? <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Höhenprofil: ${p.titel}`}
        style={{ display: 'block', width: '100%', background: '#fff' }}>
        <text x={L} y={12} fontSize="11" fontWeight="600">Anfang → Ende: {unterschiedText}{Math.abs(unterschied) >= .005 ? unterschied > 0 ? ' (aufwärts)' : ' (abwärts)' : ' (gleich hoch)'}</text>
        <text x={L} y={27} fontSize="11">Höchster − tiefster Bodenpunkt: {zahl(bodenSpanne, 2)} m</text>
        {[0, .5, 1].map(t => { const h = minH + t * (maxH - minH); return <g key={t}>
          <line x1={L} x2={W - R} y1={y(h)} y2={y(h)} stroke="#e2e8f0" />
          <text x={L - 6} y={y(h) + 4} textAnchor="end" fontSize="11">{zahl(h)}</text>
        </g> })}
        <text x={L} y={41} fontSize="10">Höhe m ü. M.</text>
        <path d={`${path} L${x(g.b.dist)},${H - U} L${L},${H - U} Z`} fill="#e7d8be" />
        <path d={path} fill="none" stroke="#79512e" strokeWidth="2" />
        {g.strahl && <>
          <polygon points={`${L},${y(g.strahl.anfang)} ${W - R},${y(g.strahl.ende)} ${W - R},${y(g.strahl.ende + p.sicht!.toleranzM)} ${L},${y(g.strahl.anfang + p.sicht!.toleranzM)}`} fill="#dbeafe" />
          <line x1={L} y1={y(g.strahl.anfang + p.sicht!.toleranzM)} x2={W - R} y2={y(g.strahl.ende + p.sicht!.toleranzM)} stroke="#60a5fa" strokeDasharray="4 3" />
          <line x1={L} y1={y(g.strahl.anfang)} x2={W - R} y2={y(g.strahl.ende)} stroke="#0369a1" strokeWidth="2" />
          <line x1={L} x2={L} y1={y(g.a.h)} y2={y(g.strahl.anfang)} stroke="#0369a1" strokeWidth="1.5" />
          <line x1={W - R} x2={W - R} y1={y(g.b.h)} y2={y(g.strahl.ende)} stroke="#0369a1" strokeWidth="1.5" />
          <text x={L + 5} y={(y(g.a.h) + y(g.strahl.anfang)) / 2 + 4} fill="#0369a1" fontSize="10" stroke="#fff" strokeWidth="3" paintOrder="stroke">+{zahl(p.sicht!.augeM, 2)} m</text>
          <text x={W - R - 5} y={(y(g.b.h) + y(g.strahl.ende)) / 2 + 4} textAnchor="end" fill="#0369a1" fontSize="10" stroke="#fff" strokeWidth="3" paintOrder="stroke">+{zahl(p.sicht!.zielM, 2)} m</text>
          <circle cx={L} cy={y(g.strahl.anfang)} r="4" fill="#0369a1" />
          <circle cx={W - R} cy={y(g.strahl.ende)} r="4" fill="#0369a1" />
          <text x={L + 5} y={y(g.strahl.anfang) - 8} fill="#0369a1" fontSize="11">Fahrer*innenauge</text>
          <text x={W - R - 5} y={y(g.strahl.ende) - 8} textAnchor="end" fill="#0369a1" fontSize="11">Ziel</text>
        </>}
        {g.getroffen && <>
          <line x1={x(g.getroffen.dist)} x2={x(g.getroffen.dist)} y1={y(g.getroffen.h)} y2={y(g.getroffen.strahlH)} stroke="#dc2626" strokeWidth="3" />
          <circle cx={x(g.getroffen.dist)} cy={y(g.getroffen.h)} r="5" fill="#dc2626" />
        </>}
        {[0, .5, 1].map(t => { const d = t * (g.b.dist - g.a.dist); return <text key={t} x={x(g.a.dist + d)} y={H - U + 17} fontSize="11" textAnchor="middle">{zahl(d, 0)}</text> })}
        <text x={(L + W - R) / 2} y={H - 5} textAnchor="middle" fontSize="11">Abstand {p.sicht ? 'ab Auge entlang der Sichtlinie' : 'ab Profilanfang'} (m)</text>
      </svg>
      <p style={{ margin: '6px 0' }}>Braun: Boden{p.sicht ? ' · Blau: Blick vom Fahrer*innenauge zum Ziel' : ''}.</p>
      {p.sicht && <p style={{ margin: '6px 0' }}>{Math.abs(g.a.h - g.b.h) < .05 ? 'Der Boden liegt an beiden Enden ungefähr gleich hoch.'
        : `Der Boden am Fahrzeugstandort liegt laut Höhenmodell ${zahl(Math.abs(g.a.h - g.b.h))} m ${g.a.h > g.b.h ? 'höher' : 'tiefer'} als am Ziel.`}
        {' '}Die Höhe ist gegenüber der Entfernung anders skaliert.</p>}
      <p style={{ margin: '6px 0', fontWeight: 600 }}>
        {p.sicht ? p.hinweis ? 'Das Bodenprofil erlaubt hier keinen verlässlichen Nachweis der Fahrbahnsicht.' : p.sicht.frei ? 'Geländemodell: In den geprüften Stützpunkten ist diese Sichtlinie frei.' : 'Geländemodell: Der Boden verdeckt diese Sichtlinie.'
          : 'Höhenverlauf zur Längsneigung. Hier wird keine Verdeckung einer Sichtlinie geprüft.'}
      </p>
      {g.getroffen && <p>Die rote Markierung zeigt, wo der Boden laut Höhenmodell am stärksten über den Sichtstrahl ragt.</p>}
      <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer' }}>Messwerte und Quelle</summary>
        {p.sicht && <>
          <p>{g.getroffen
            ? `Bei ${zahl(g.getroffen.dist - g.a.dist)} m ab Fahrer*innenauge liegt das Gelände ${zahl(g.getroffen.ueberM, 2)} m über dem Sichtstrahl.`
            : 'In den geprüften Stützpunkten überschreitet das Gelände den Sichtstrahl nicht um mehr als die berücksichtigte Toleranz.'}
            {' '}Toleranz dieser Berechnung: {zahl(p.sicht.toleranzM, 2)} m (hellblauer Bereich).</p>
          <p>Auge {zahl(p.sicht.augeM, 2)} m, Ziel {zahl(p.sicht.zielM, 2)} m über Gelände. Gebäude und Bewuchs sind in diesem Geländeprofil nicht enthalten.</p>
          <p>Die Fahrzeugposition wird entlang der Fahrbahn gemessen. Die waagerechte Achse des Schnitts zeigt die Länge der Sichtlinie vom Fahrer*innenauge zum Ziel.</p>
        </>}
        <p style={{ fontSize: 11 }}>Horizontale und vertikale Achse haben unterschiedliche Massstäbe. {g.punkte.length} Stützpunkte; zwischen ihnen ist die Linie verbunden.</p>
        <p style={{ margin: '6px 0', fontSize: 11 }}>{p.quelle}; Datenstand {p.datenstand || 'unbekannt'}; Vollständigkeit unbekannt
          {p.abgerufen ? `; abgerufen ${new Date(p.abgerufen).toLocaleString('de-CH')}` : ''}.</p>
      </details>
    </> : <p>Für diesen Höhenschnitt fehlen ausreichende Höhenpunkte.</p>}
  </details>
}
