// Reine Kennungen für Rechenkern und Darstellung, ohne Browser- oder React-Abhängigkeit.
export const fgsSichtId = (z: { fgsId: string; zufahrt: string }): string => `${z.fgsId}|${z.zufahrt}`
export const richtungSichtId = (e: { knoten: number | null; zufahrt: string }, r: { richtung: string }): string => `${e.knoten ?? 'ort'}|${e.zufahrt}|${r.richtung}`
export const tueSichtId = (fid: string, lage: string): string => `tue|${fid}|${lage}`
export const kreiselSichtId = (id: number, art: string): string => `kreisel|${id}|${art}`
