// ── Bedarfsmodul Runde 5 (Lesetest): Datenbank-Angaben nur im Tooltip ──
//
// Herkunftstexte der Vorbelegung dürfen OSM-Tags, Knotennummern oder Layernamen als Beleg tragen, aber nur in ⟦…⟧. Im Lesetext
// (Panel, Bericht, Annahmen, Hinweise) fallen diese Teile weg (lesetext); im Tooltip stehen sie in Klammern (tooltipText).

/** Beleg für den Tooltip, z. B. tag('lit=yes') → « ⟦lit=yes⟧» */
export const tag = (t: string): string => ` ⟦${t}⟧`

/** Text ohne Belege in ⟦…⟧ (Lesetext) */
export const lesetext = (t: string): string => t.replace(/\s*⟦[^⟧]*⟧/g, '').replace(/\(\s*\)/g, '').replace(/\s+([,;:.)])/g, '$1').trim()

/** Text für den Tooltip: Belege in Klammern */
export const tooltipText = (t: string): string => t.replace(/\s*⟦([^⟧]*)⟧/g, ' ($1)')
