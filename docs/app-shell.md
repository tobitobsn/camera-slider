# App-Rahmen & Navigation

> Die app-weite Übersicht über **den Rahmen, in dem jedes Feature angezeigt wird** — Navigation, Layout-Bereiche und die Muster, die sich jede Seite teilt.
>
> - Erstellt von `/init` (erster ganzheitlicher Durchgang: Top-Level-Bereiche + Layout).
> - Verfeinert von `/architecture`, sobald ein Feature designt wird.
> - **Flughöhe:** Struktur, nicht Styling. Farben, Schriften und Komponenten-Styling gehören in `docs/design-system.md`; die Innereien einer einzelnen Seite gehören in das `design.md` des jeweiligen Features.

## Owning feature

Owner: **PROJ-1** (BLE-Verbindung & Pairing) — der Rahmen ist ein einfacher Header, der zur einen Bildschirmseite der App gehört. Es gibt keine eigene "App Shell & Navigation"-Feature, da die App nur einen Screen hat.

## Top-Level-Bereiche

Kein Navigationsmenü — die App ist eine einzelne Bildschirmseite. Presets (PROJ-4) und Zeitraffer (PROJ-5) werden als Abschnitte/Sheets auf derselben Seite ergänzt, sobald sie gebaut werden — keine eigenen Routen.

## Layout-Bereiche

- **Header:** Verbindungsstatus (verbunden/getrennt, Gerätename), Reconnect-Aktion; im Zustand `connected` rechts die Akkuanzeige (PROJ-6)
- **Sperr-Banner (PROJ-6):** unter dem Header, nur wenn der Slider nach einem Schutz-Stopp gesperrt ist — „Akku leer – bitte laden“ bzw. „Akkumessung gestört – bitte Verkabelung prüfen“ mit Countdown bis zur Abschaltung, dauerhaft, nicht wegklickbar; nach der Abschaltung übernimmt der normale Zustand für eine verlorene Verbindung
- **Content:** Manuelle Steuerung (Jog-Buttons/Slider), Start-/Endpunkt setzen, Auto-Fahrt auslösen — vertikal gestapelt
- **Footer/Sheet (später):** Presets-Liste (PROJ-4), Zeitraffer-Einstellungen (PROJ-5)

## Seiten-Muster

- **Seitenkopf:** kein Titel-Wechsel nötig, ein statischer App-Titel
- **Ladezustand:** Spinner beim BLE-Verbindungsaufbau
- **Leerzustand:** "Kein Gerät verbunden" mit Scan-/Verbinden-Button
- **Fehlerzustand:** Verbindungsabbruch zeigt Banner + automatischer Reconnect-Versuch
- **Feedback:** Toast/Snackbar für erfolgreiche Aktionen (z. B. "Preset gespeichert")
- **Sperrzustand (PROJ-6):** gesperrter Slider → Banner + alle Bewegungs-Bedienelemente über die bestehenden `disabled`-Props nicht bedienbar

## Auth-Status

Entfällt — keine Accounts, keine Anmeldung.

## Shell-Komponenten

| Komponente | Datei | Zweck |
|-----------|------|---------|
| ConnectionProvider | `src/connection/ConnectionProvider.tsx` | App-weiter Verbindungs-Zustand (Context + useReducer), von PROJ-1 |
| ConnectionHeader | `src/components/ConnectionHeader.tsx` | Verbindungsstatus, Gerätename, "Erneut suchen"-Aktion — oben auf jeder Ansicht; enthält ab PROJ-6 die Akkuanzeige |

_Festgelegt von `/architecture` für PROJ-1, 2026-09-22._

---

_Dies ist ein lebendes Dokument. Wenn `/architecture` ein Feature designt, das einen Abschnitt oder ein neues Seiten-Muster hinzufügt, wird diese Karte zuerst aktualisiert. Verhaltensänderungen am Rahmen laufen über `/refine PROJ-1`._
