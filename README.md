# fgsCheck (Prototyp)

Prüft im Browser die Sicht an bestehenden und geplanten Fussgängerstreifen. Dazu kommen Bedarf und Querungstyp nach bfu, VSS 40 240,
40 241 und 40 242, Stadt und Kanton Bern, und die Trottoirüberfahrt mit Knotensicht. Die App nutzt Daten der Amtlichen Vermessung und
von OpenStreetMap, erkennt gelbe Streifen im Luftbild und erstellt einen Bericht.

App: https://fgscheck.ch/ · Code: https://github.com/pnfzygrzgf-svg/fgsCheck

Vibecoding. Don't trust, verify!

Die Bedienung steht in der App unter «So funktioniert's», die Rechenregeln mit Normstellen in der Regelübersicht und unter «Begriffe».

## Start

```bash
npm install
npm run dev      # Entwicklungsserver, Adresse steht in der Ausgabe
npm test         # Tests (vitest)
npm run build    # Typprüfung und Build nach dist/
```

## Aufbau

React, TypeScript und Vite, Karte mit Leaflet. Es gibt keinen eigenen Server; gerechnet wird im Web Worker.

| Ort | Inhalt |
|---|---|
| `src/rechner/` | Sichtrechnung ohne Oberfläche, Einstieg `index.ts` |
| `src/bedarf/` | Bedarf und Querungstyp, Regelübersicht und Quellen der Prüfungen |
| `src/tue/` | Trottoirüberfahrt und Knotensicht |
| `src/knotensicht/` | Rechenkern des SichtweitenCheck, wortgleiche Kopie |
| `src/daten/` | Abruf und Einlesen der Quellen, Quellenregister in `quellenregister.ts` |
| `src/daten/anbieter/gemeinsam/`, `src/hoehenkurven/`, `src/hoehenprofil/` | gemeinsame Module, hier führend |
| `src/fall.ts` | Fall-Datei und Speicherung im Browser |

Die gemeinsamen Module werden hier geändert und mit `scripts/anbieter_uebernehmen.mjs`, `hoehenkurven_uebernehmen.mjs` und
`hoehenprofil_uebernehmen.mjs` in die anderen Rechner übernommen. Den Rechenkern holt `scripts/knotensicht_holen.mjs` aus dem
SichtweitenCheck; in `src/knotensicht/` wird nichts von Hand geändert. Manifeste und Tests prüfen alle Kopien.

## Datenquellen

Reihenfolge je Feld: amtlich lokal, Bund, OSM, Annahme, Eingabe von Hand. Modellierte oder abgeleitete Werte sind Vorschläge und
wirken erst nach Bestätigung. Ein leerer oder unvollständiger Ausschnitt ergibt nie ein «keines» oder «Nein». Welche Quellen an einem
Ort gelten, zeigt die App unter «Datenlage hier».

- Luftbild, Landeskarte, Höhenmodell swissALTI3D, swissTLM3D, Gemeindegrenzen: © swisstopo
- Haltestellen, Verkehrsmodell NPVM, Bauzonen, Unfälle: BAV, ARE und ASTRA über geo.admin.ch
- Bodenbedeckung: Amtliche Vermessung der Kantone über geodienste.ch
- Strassennetz und Übergänge: © OpenStreetMap-Mitwirkende, ODbL (Overpass API)
- Parkfelder, Bäume, Tempo, Haltestellen, Verkehrsdaten Stadt Bern: Geodaten Stadt Bern
- Tempo, Zonen, Signale, Einrichtungen und Kartenkontext weiterer Kantone und Städte: je nach Ort, Anbieter und Lizenz nennt die App

Normen erscheinen nur als Nummern, Ziffern, Seiten und Zahlenwerte, nie als Normtext. Lizenzen der eingebundenen Bibliotheken und
Daten stehen unter `public/licenses/`.

## Datenschutz

Keine Anmeldung, kein eigener Server. Eingaben und Ergebnisse werden nicht gesendet; sie bleiben im Browser (localStorage) oder in der
Fall-Datei. Der Browser holt Karten und Daten direkt bei den Diensten. Diese erhalten nur Koordinaten, Ausschnitte und Suchbegriffe und
sehen technisch die IP-Adresse. Seitenaufrufe zählt GoatCounter ohne Cookies und ohne Speicherung der IP-Adresse. Die vollständige
Liste der Dienste steht in der App unter «Datenschutz».

## Grenzen

- Amtliche Vermessung frei über geodienste.ch: 19 Kantone ganz, Wallis teilweise (ohne einzelne Gemeinden, z. B. Sitten,
  Brig), Liechtenstein. LU, VD, NE, NW, OW und JU geben die AV nur mit Freigabe ab; dort rechnet die App nicht.
- Luftbild-Erkennung: nur gelbe Streifen mit Balken bis rund 6 m; weisse Streifen erkennt die App nicht.
- Mehrere Streifen an einem Knoten und sehr breite Streifen bildet die App nicht immer richtig (offen); dann
  «Streifen von Hand».
- Amtliche Parkfelder nur in der Stadt Bern; sonst von Hand bzw. aus OSM-Vorschlägen (bestätigen). Private Parkplätze,
  Hecken und Mauern (Höhe) fehlen in den Daten.
- Knotensicht der Trottoirüberfahrt nur an Einmündungen und an Kreuzungen über die Zufahrt ohne Vortritt; an
  Grundstückzufahrten nur ein Hinweis. Bäume aus dem Baumkataster zählen (anders als im SichtweitenCheck).
- Wartezeit beim Ausfahren nur als Schätzung aus dem DTV der Hauptstrasse (Bern); ohne Verkehrszahlen offen.
- Die App ersetzt keine Beurteilung vor Ort.

## Veröffentlichung

`.github/workflows/deploy.yml` baut bei jedem Push auf `main` (`npm ci`, Tests, `npm run build`) und veröffentlicht `dist/` auf
GitHub Pages unter https://fgscheck.ch/. Der Referenzvergleich (`src/referenz.test.ts`) läuft nur lokal, den Pfad setzt `FGS_REFERENZ`.

## Lizenz

Der Rechner ist frei nutzbar. Wer die Weiterentwicklung unterstützen möchte, kann über Ko-fi spenden: [ko-fi.com/pnfzygrzgfsvg](https://ko-fi.com/pnfzygrzgfsvg).

Code: **[MIT](LICENSE)** (Copyright (c) 2026 pnfzygrzgf-svg). Eigene Inhalte (Texte, Dokumentation, Berichte, eigene Grafiken):
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de)**. Name und Logo sind ausgenommen; Überblick in
[LICENSE-INHALTE.md](LICENSE-INHALTE.md). Bis zur Version 0.7.0 (31.10.2026) galt CC BY-NC 4.0. Die eingebundenen
**Dritt-Daten** behalten ihre eigenen Lizenzen und Quellenangaben, siehe [Datenquellen](#datenquellen)
(swisstopo, Amtliche Vermessung, OpenStreetMap/ODbL, Geodaten Stadt Bern). polygon-clipping steht unter MIT.
