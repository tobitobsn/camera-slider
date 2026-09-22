# Design-System

> Konkrete Design-Werte für die React-Native-App — vorgeschlagen von `/init`, vom Nutzer freigegeben. `/build` wendet diese Werte an, ohne erneut nachzufragen.

## Farben

Alle Werte als Hex, nutzbar in einer RN-Theme-Datei (z. B. `src/theme/colors.ts`) unabhängig vom Styling-Ansatz (StyleSheet, NativeWind, Tamagui, …).

| Token | Dunkel (Standard) | Hell |
|-------|--------------------|------|
| `background` | `#121212` | `#FAFAFA` |
| `surface` (Karten/Sheets) | `#1E1E1E` | `#FFFFFF` |
| `foreground` (Text) | `#F2F2F2` | `#1A1A1A` |
| `muted-foreground` (Sekundärtext) | `#A3A3A3` | `#6B6B6B` |
| `primary` (Akzent, Amber) | `#F59E0B` | `#D97706` |
| `primary-hover` | `#FBBF24` | `#B45309` |
| `primary-active` | `#D97706` | `#92400E` |
| `primary-subtle-bg` | `#3A2A0A` | `#FEF3C7` |
| `destructive` (Stop/Löschen) | `#EF4444` | `#DC2626` |
| `border` | `#2E2E2E` | `#E5E5E5` |

Kein reines `#000000` oder `#FFFFFF` für Hintergrund/Text — near-black/near-white wirkt gestaltet statt ungestylt. Der Akzentton hat Hover-, Active- und dezente Hintergrund-Variante, nie flächig unmoduliert.

**Standard-Theme: dunkel** (passt zu Foto-/Video-Werkzeugen, blendet am Set nicht). Hell-Theme ist von Anfang an definiert, auch wenn v1 primär im Dunkel-Modus genutzt wird.

Kontrast: Text auf eigenem Hintergrund erreicht in beiden Themes mindestens 4.5:1 (`foreground` auf `background`/`surface` geprüft).

## Typografie

- **Schriftart:** System-Font (RN-Default: San Francisco/Roboto) — kein Custom-Font-Loading nötig für ein internes Tool
- **Größenskala:** `xs` 12 · `sm` 14 · `base` 16 · `lg` 20 · `xl` 24 · `2xl` 32 (px, für RN als `fontSize`)
- **Gewichte:** Überschriften `600` (semibold), Fließtext/Labels `400` (regular), Buttons `600`

## Radius, Abstand, Elevation

- **Radius:** einheitlich `12` überall (Buttons, Karten, Sheets, Inputs) — keine gemischten Eckenradien
- **Abstand-Rhythmus:** `4 / 8 / 12 / 16 / 24 / 32` (px), Basis-Einheit `8`
- **Elevation:** Karten/Sheets heben sich per `surface`-Farbe + dezentem Schatten (`shadowOpacity: 0.3` im Dark Theme) ab, keine Border-only-Trennung

## Komponenten-Konventionen

- **Buttons:** Standardgröße groß (min. `56px` Höhe) für Bedienung unterwegs/mit Handschuhen; Primär-Button = `primary`-Farbe, Stop/Destruktiv = `destructive`
- **Formularfelder:** Höhe `48px`, `radius: 12`, `border` sichtbar im unfokussierten Zustand
- **Jog-/Fahr-Controls:** große Touch-Ziele (min. `64px`), deutliches Pressed-Feedback (Farbwechsel zu `primary-active`)
- **Fokus/Hover:** jedes interaktive Element hat einen sichtbaren Pressed- und Focus-Zustand (Ring in `primary` oder Hintergrundwechsel zu `primary-subtle-bg`)
- **Ladezustand:** Spinner in `primary`-Farbe
- **Leerzustand:** `muted-foreground`-Text + Icon, zentriert
- **Fehlerzustand:** Banner in `destructive`-Farbe mit kurzer Nachricht
- **Toasts:** unten, `surface`-Hintergrund, 2–3 Sekunden

---

_Dieses Dokument ist verbindlich für `/build`. Änderungen an Farben/Tokens gehen über eine explizite Anfrage des Nutzers, nicht über eine einzelne Feature-Implementierung._
