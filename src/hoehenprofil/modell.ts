export interface HoehenPunkt { dist: number; h: number }
export interface HoehenProfil {
  id: string
  titel: string
  /** Lesbare Zufahrt statt einer flachen Liste technischer Profilkennungen. */
  gruppe?: { id: string; titel: string }
  auswahlText?: string
  zweck: string
  zielText?: string
  hinweis?: string
  linie: [number, number][]
  punkte: readonly HoehenPunkt[]
  quelle: string
  datenstand?: string
  abgerufen?: string
  /** Nur bei tatsächlich gerechneter Gelände-Sichtprüfung; keine Ableitung aus Steigung. */
  sicht?: { augeM: number; zielM: number; toleranzM: number; frei: boolean }
}

export function profilGruppen(profile: readonly HoehenProfil[]) {
  const gruppen = new Map<string, { id: string; titel: string; profile: HoehenProfil[] }>()
  for (const p of profile) {
    const gruppe = p.gruppe ?? { id: 'weitere', titel: 'Weitere Profile' }
    if (!gruppen.has(gruppe.id)) gruppen.set(gruppe.id, { ...gruppe, profile: [] })
    gruppen.get(gruppe.id)!.profile.push(p)
  }
  return [...gruppen.values()]
}

export function standardProfil(profile: readonly HoehenProfil[], wahl?: string | null) {
  return profile.find(p => p.id === wahl) ?? profile.find(p => p.hinweis) ?? profile.find(p => p.sicht?.frei === false) ?? profile[0]
}

/** Eine nachvollziehbare Einzelprüfung als Vorgabe; die Gesamtansicht ist ausdrücklich wählbar. */
export function profilObjekteWaehlen<T extends { id: string; hoehenprofil?: HoehenProfil }>(objekte: readonly T[], wahl: string | null, alle: boolean): readonly T[] {
  if (alle) return objekte
  const id = standardProfil(objekte.flatMap(o => o.hoehenprofil ? [o.hoehenprofil] : []), wahl)?.id ?? objekte[0]?.id
  return objekte.filter(o => (o.hoehenprofil?.id ?? o.id) === id)
}

/** Darstellung derselben Profilpunkte und Höhen wie in der Rechnung, keine neue Bewertung. */
export function profilGeometrie(p: HoehenProfil) {
  const punkte = p.punkte.filter(x => Number.isFinite(x.dist) && Number.isFinite(x.h))
  const a = punkte[0], b = punkte[punkte.length - 1]
  if (!a || !b || punkte.length < 2 || b.dist <= a.dist) return null
  const sicht = p.sicht
  const strahl = sicht ? { anfang: a.h + sicht.augeM, ende: b.h + sicht.zielM } : null
  const pruefpunkte = strahl ? punkte.slice(1, -1).map(x => {
    const t = (x.dist - a.dist) / (b.dist - a.dist)
    const strahlH = strahl.anfang + (strahl.ende - strahl.anfang) * t
    return { ...x, strahlH, ueberM: x.h - strahlH }
  }) : []
  const hoechster = pruefpunkte.reduce<typeof pruefpunkte[number] | null>((m, x) => !m || x.ueberM > m.ueberM ? x : m, null)
  const getroffen = sicht && hoechster && hoechster.ueberM > sicht.toleranzM ? hoechster : null
  return { punkte, a, b, strahl, getroffen,
    minH: Math.min(...punkte.map(x => x.h), ...(strahl ? [strahl.anfang, strahl.ende] : [])),
    maxH: Math.max(...punkte.map(x => x.h), ...(strahl ? [strahl.anfang + sicht!.toleranzM, strahl.ende + sicht!.toleranzM] : [])) }
}

/** Lage eines Profilpunkts auf der Abfragelinie, für die Markierung in der Karte. */
export function profilLage(p: HoehenProfil, dist: number): [number, number] | null {
  const g = profilGeometrie(p)
  if (!g || p.linie.length !== 2 || !Number.isFinite(dist)) return null
  const t = Math.max(0, Math.min(1, (dist - g.a.dist) / (g.b.dist - g.a.dist)))
  const [a, b] = p.linie
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}
