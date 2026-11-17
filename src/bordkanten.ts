// ── Bordsteinkanten der AV und Breiten ab Kante (06.11.2026, übernommen aus VeloroutenCheck breitenmessung.ts) ──
//
// Die Bordsteinkante ist die Kante der AV-Fläche «Strasse_Weg», hinter der keine Strasse liegt. Die AV teilt eine Strasse in
// mehrere Flächen; deren gemeinsame Kanten sind keine Bordsteine und fallen weg (Prüfpunkt PRUEF_M auf der Aussenseite liegt in
// einer anderen Strassenfläche). Löcher einer Strassenfläche (Verkehrsinseln) zählen mit. Geprüft wird je Stück von höchstens
// STUECK_M: eine lange Kante, die nur auf einem Teil an eine andere Strassenfläche grenzt (Einmündung), fiele sonst ganz weg.
// Gerechnet wird in LV95 (Meter). Das Werkzeug «Messen» (messen.ts) misst damit ab einer Kante bzw. quer durch die ganze Fläche.
// Flächen (Plan) gehen über rechner/planflaechen.avMitPlan in die AV ein, die geplante Bordkante zählt also wie die bestehende.
// Seit 17.11.2026 liegt die Rechnung im Kartenbaustein (messAv.ts), damit das Messwerkzeug der Karte in allen Rechnern gleich misst.


export { FANG_M, FLAECHE_MAX_M, bordkanten, fangeAnKante, messeAbKante, messeFlaeche, type Kante } from './kartenbaustein/messAv'
