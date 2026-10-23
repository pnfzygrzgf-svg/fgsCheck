// ── Bedarfsmodul: gemeinsame Typen (E0) ──
//
// Regelkatalog (katalog.ts), Eingaben (eingaben.ts), Regeln (regeln.ts) und Entscheidbaum (entscheid.ts) teilen diese Typen.
// Keine Logik, kein Normtext.

/** Ebenen: Recht und Norm sind immer an; Bern, Kanton BE und Richtlinie lassen sich schalten (Optionen.ebenen) */
export type Ebene = 'Recht' | 'Norm' | 'Bern' | 'Kanton BE' | 'Richtlinie'
export const EBENEN: readonly Ebene[] = ['Recht', 'Norm', 'Bern', 'Kanton BE', 'Richtlinie']

/**
 * Stärke eines Befunds (Entscheid E0-1, Wortlaut der Quelle): hart = Pflichtverletzung (rot); hart_bericht = rot, Abweichung nur
 * mit verkehrstechnischem Bericht; weich = Empfehlung (gelb); hinweis = Information ohne Wertung.
 */
export type Staerke = 'hart' | 'hart_bericht' | 'weich' | 'hinweis'
export const STAERKEN: readonly Staerke[] = ['hart', 'hart_bericht', 'weich', 'hinweis']

/**
 * Art eines Katalogeintrags: befund = Regel mit eigenem Befund; weiche = Verzweigungsknoten des Baums, meldet einen Hinweis;
 * aggregat = Zusammenfassung ohne eigenen Befund (C-E, D-E, E-E); verweis = Verweis auf eine andere Regel; gestrichen = bewusst
 * ohne Befund (D2b, Entscheid E0-5).
 */
export type RegelArt = 'befund' | 'weiche' | 'aggregat' | 'verweis' | 'gestrichen'

/** Gruppen des Entscheidbaums (Skizze Abschnitt 3); B5 = Grundprüfung nach bfu (Big Five, eigenes Modul grundpruefung.ts) */
export type Gruppe = 'A' | 'B' | 'C' | 'D' | 'E' | 'Q3' | 'F' | 'G' | 'H' | 'I' | 'B5'

/**
 * Thema einer Regel in Alltagssprache (Runde 2, Nutzerentscheid 20.10.2026): ordnet Befundblatt und Prüfübersicht. Namen,
 * Umfang und Anzeigereihenfolge in themen.ts (THEMEN); die Themen der Grundprüfung (Sicht, Insel, Fahrstreifen und Verkehr,
 * Beleuchtung, Nachfrage) heissen dort gleich.
 */
export type Thema =
  | 'zulaessigkeit' | 'nachfrage' | 'sicht' | 'insel' | 'fahrstreifen' | 'lage' | 'ausruestung' | 'beleuchtung' | 'lichtsignal'
  | 'trottoirueberfahrt' | 'ohneVortritt'

/** Werk einer Quelle (Kürzel aus WERKE in katalog.ts) mit Ziffer, Kapitel, Seite oder Tabelle */
export interface QuelleRef { werk: string; ziffer: string }

/** Eintrag im Regelkatalog (Daten, keine Logik) */
export interface RegelDef {
  id: string
  /** Kurztitel in Alltagssprache (worum es geht, nicht das Ergebnis); in der Oberfläche statt der Nummer allein */
  titel: string
  gruppe: Gruppe
  /** Thema (Pflicht): genau eines je Regel, Anzeige nach Thema */
  thema: Thema
  /**
   * Prüfsatz (Pflicht, Nutzerentscheid 23.10.2026): eine Frage bzw. ein Bedingungssatz in Alltagssprache, was gemessen bzw. abgefragt
   * wird (mit Grenzwert und Einheit aus werte) und was daraus folgt, Ton nach Stärke; eigene Formulierung, kein Normtext. Ablauf
   * (Weichen, Zusammenfassungen, Verweise) beginnt mit «Ablauf:», gestrichene Regeln mit «Gestrichen:». Anzeige: Regelübersicht «Prüft:».
   */
  pruefsatz: string
  art: RegelArt
  /** null nur bei aggregat, verweis, gestrichen */
  ebene: Ebene | null
  /** Hauptstärke; null nur bei aggregat, verweis, gestrichen */
  staerke: Staerke | null
  /** weitere Stärken, die die Regel je nach Fall meldet (z. B. F2d hart oder weich, F3 weich oder Hinweis) */
  auch?: readonly Staerke[]
  /** Eingabefelder (Namen aus eingaben.ts; Unterfelder mit Punkt) */
  eingaben: readonly string[]
  /** Bedingung als Lesetext (formal, nur Doku; ausgewertet wird regeln.ts) */
  bedingung: string
  /** Ergebnis: eigener Kurztext, kein Normtext */
  ergebnis: string
  /**
   * Kurzform für die Zusammenfassung (Runde 3, zusammenfassung.ts): Stichwort in Alltagssprache, das sich in eine Aufzählung fügt
   * («Streifen zu schmal (2,80 m statt mindestens 3,00 m)»); Platzhalter {ist}, {soll} (mit Einheit, «≥» als «mindestens») und
   * {w:Schlüssel} (Schwelle aus werte). Fehlt sie, bildet die Zusammenfassung Kurztitel mit Ist und Soll.
   */
  kurzsatz?: string
  quellen: readonly QuelleRef[]
  bemerkung?: string
  /** Hinweis auf die Norm, der im Befund mitgeht (z. B. bei Regeln aus Berner Unterlagen) */
  normHinweis?: string
  /** Schwellen und Zahlenwerte der Regel; der Code liest sie von hier */
  werte?: Readonly<Record<string, number>>
  /** Grösse für die Tabelle Masse Soll/Ist (Regeln mit gleicher Grösse bilden eine Zeile) */
  groesse?: string
  /** hartes Verbot (Recht) gilt nur mit Tatsachen bzw. bestätigten Werten: beruht es auf einer Annahme bzw. Schätzung, bleibt die Regel
   * offen («Annahme bestätigen»; Korrektur M2, Nutzerentscheid 21.10.2026). true: alle Eingaben zählen; Liste: nur diese Felder (A2:
   * Strecke/Zone, das Tempo grenzt nur die Anwendbarkeit ein; Runde 4) */
  nurMitBestaetigung?: true | readonly string[]
  einheit?: string
}

/** Zustand eines Eintrags im Befund: verletzt (Bedingung trifft zu) oder offen (Eingabe fehlt; Entscheid E0-2) */
export type Zustand = 'verletzt' | 'offen'

/** Ein Eintrag im Befund */
export interface Eintrag {
  id: string
  ebene: Ebene
  staerke: Staerke
  zustand: Zustand
  /** Ergebnistext aus dem Katalog */
  text: string
  /** Quellen als Kurztext, z. B. «VSS 40 241:2019-03 Z. 24» */
  quelle: string
  ist?: string
  soll?: string
  einheit?: string
  /** fallbezogene Ergänzung (z. B. welche Seite, welcher Grenzwert) */
  detail?: string
  /** bei offen: fehlende Eingaben */
  fehlend?: string[]
  /** offen, weil das Verbot nur auf Annahmen beruht (Korrektur M2): fehlend sind dann die zu bestätigenden Felder */
  bestaetigen?: boolean
  normHinweis?: string
}

/** Befundlisten einer Ebenengruppe */
export interface Liste {
  /** hart, rot */
  verletzungen: Eintrag[]
  /** hart mit Bericht: Begründungspflichten */
  bericht: Eintrag[]
  /** weich, gelb */
  empfehlungen: Eintrag[]
  hinweise: Eintrag[]
  /** grau: Eingabe fehlt, zählt nie als bestanden */
  offen: Eintrag[]
}

/** Zeile der Tabelle Masse Soll/Ist */
export interface MassZeile {
  groesse: string
  einheit: string
  soll: string
  ist: string
  /** nicht_anwendbar: Wert ohne Soll, die Regel greift nicht (Runde 4: Abstand bei ganzer Strasse); nie «erfüllt» ohne Soll.
   * Runde 5: ausnahme = unter dem Soll, die Regel lässt es hier zu (Text in ausnahme); annahme = erfüllt nur nach einer Annahme;
   * vorbehalt = erfüllt unter Vorbehalt einer offenen Frage (vorbehalt: Text) */
  zustand: 'erfuellt' | 'verletzt' | 'offen' | 'nicht_anwendbar' | 'ausnahme' | 'annahme' | 'vorbehalt'
  /** Text zu ausnahme bzw. vorbehalt */
  zusatz?: string
  regeln: string[]
}

/** Empfohlener Querungstyp (Skizze 3, Ergebnisse D und E) */
export type EmpfTyp =
  | 'Q1'            // Fussgängerstreifen (mit Elementen)
  | 'Q2'            // Lichtsignalanlage
  | 'Q3'            // Trottoirüberfahrt (nur an Einmündungen, wenn alle zwingenden Punkte erfüllt sind)
  | 'ohne_vortritt' // Querung ohne Vortritt (Nase, Einengung, Anhebung, ohne bauliche Massnahme)
  | 'furt'          // Fussgängerfurt (Insel ohne Balken)
  | 'flaechig'      // flächige Querung (Begegnungszone, Mehrzweckstreifen)
  | 'keiner'        // nicht beurteilt (ausserorts) bzw. Eingaben fehlen

export interface Empfehlung {
  typ: EmpfTyp
  /** Elemente als Kurztexte, z. B. «Fussgängerstreifen», «Schutzinsel» */
  elemente: string[]
  /** zusätzlich zu prüfen (z. B. Trottoirüberfahrt an der Einmündung) */
  zusatz: string[]
  /** Regeln, die den Typ bestimmen */
  grundlage: string[]
  /** vorläufig: eine harte Regel aus C oder D ist offen (Eingabe fehlt) bzw. die Zulässigkeit ist offen */
  vorlaeufig: boolean
  /** offene harte Regeln (bzw. die Eingabe inselMoeglich bei empfohlener Insel), die den Vorbehalt auslösen */
  offenWegen: string[]
}

export type Zulaessigkeit = 'zulaessig' | 'mit_begruendung' | 'nicht_angezeigt' | 'offen'

export interface Befund {
  /** false: ausserorts (A1) bzw. Grundeingaben fehlen */
  beurteilt: boolean
  /** Ende des Baums vor der Typwahl */
  ende: null | 'ausserorts' | 'begegnungszone' | 'flaechig' | 'offen'
  /** Ergebnis C (Darf ein FGS hin?); null, wenn der Baum vorher endet */
  zulaessigkeit: Zulaessigkeit | null
  empfehlung: Empfehlung
  /** Recht, Norm, Richtlinie */
  norm: Liste
  /** Bern und Kanton BE (leer, wenn die Ebenen aus sind) */
  lokal: Liste
  /** alle Einträge in der Reihenfolge der Auswertung */
  alle: Eintrag[]
  masse: MassZeile[]
  /** Annahmen und geschätzte Eingaben, die in die Beurteilung eingingen */
  annahmen: string[]
  /** ausgewertete Regeln (auch ohne Befund) */
  ausgewertet: string[]
  /**
   * angewendete Regeln ohne Eintrag: Bedingung geprüft und nicht verletzt (Prüfübersicht «in Ordnung»). Nicht darin: Regeln, die
   * hier nicht anwendbar sind (Ergebnis null), und Regeln, die nur still für die Empfehlung ausgewertet wurden
   */
  erfuellt: string[]
  /** Regeln ausgeschalteter Ebenen, die mit eingeschalteter Ebene anwendbar wären (Prüfübersicht «nicht geprüft (Ebene ausgeschaltet)») */
  ebeneAus: string[]
  /** fehlende Felder je offener Regel, auch still ausgewerteter (für die Fragen hinter «vorläufig»; Korrektur M3) */
  offenFelder: Record<string, string[]>
  /** offene Einträge nach fehlendem Feld gruppiert (häufigstes Feld zuerst) */
  offenGruppen: { feld: string; regeln: string[] }[]
  /** Blöcke, die mangels Eingaben nicht ausgewertet wurden (je ein Hinweis statt vieler offener Regeln) */
  nichtGeprueft: { block: 'Q3' | 'I'; grund: string }[]
}
