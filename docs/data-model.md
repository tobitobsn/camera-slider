# Datenmodell

> Die app-weite Übersicht **welche Daten dieses Produkt speichert und wie sie zusammenhängen** — der gemeinsame Bauplan, an dem sich die Datenstrukturen jedes Features orientieren.
>
> - Erstellt von `/init` (erster ganzheitlicher Durchgang: Entitäten + Beziehungen).
> - Verfeinert von `/architecture`, sobald ein Feature designt wird.
> - **Flughöhe:** Entitäten, Beziehungen und Besitzverhältnisse stehen hier (Produkt-Ebene). Spaltentypen, Indizes und exakte Fremdschlüssel werden pro Feature in dessen `design.md` entschieden — nicht hier.

_Source: `/init`-Interview mit dem Nutzer, 2026-09-22. Kein Backend — reine lokale Datenstrukturen (AsyncStorage/SQLite) auf dem Handy, keine Datenbank-Tabellen._

## Entitäten

| Entität | Bedeutung | Gehört zu / sichtbar für |
|---------|-----------|---------------------------|
| Preset | Ein gespeichertes Fahrprofil (Name, Distanz + Richtung zwischen Start und Ende, Dauer) — bewusst keine absoluten Positionen, siehe PROJ-4s Decision Log; trägt ein `dirVersion`-Feld, das die Richtungs-Migration nach der DIR-Umkehr vom 2026-09-29 markiert | der Nutzer selbst, nur lokal auf dem Handy |
| Video-Einstellungen | Die zuletzt gewählten Einstellungen der Videoaufnahme während der Auto-Fahrt (Video an/aus, Ton an/aus, Auflösung/Bildrate, Objektiv, Stabilisierung) — ein einziger app-weiter Datensatz, keine Fokus-/Belichtungssperre (die gilt nur pro Sitzung); eingeführt mit PROJ-3 AC-26 | der Nutzer selbst, nur lokal auf dem Handy |

> Kein "zuletzt verbundenes Gerät" (Stand PROJ-1): Die App scannt bei jedem Start per Service-UUID neu und verbindet sich automatisch zum ersten passenden Treffer — kein gespeicherter Geräte-Bezug nötig. Entschieden im `/write-spec`-Interview zu PROJ-1, 2026-09-22.

## Beziehungen

Keine — Presets stehen für sich, unabhängig von der (nicht persistierten) Geräteverbindung. Die Video-Einstellungen gehören bewusst nicht zu einem Preset (PROJ-3 Decision Log, 2026-10-01).

Die aufgenommenen Videos selbst sind keine Entität der App: Sie landen in der Galerie des Geräts und werden von der App danach nicht mehr verwaltet.

## Diagramm (optional)

```
Preset (lokal)          Video-Einstellungen (lokal, ein Datensatz)
```

---

_Dies ist ein lebendes Dokument. Wenn `/architecture` ein Feature designt, das eine Entität einführt oder ändert, wird diese Karte zuerst aktualisiert, damit spätere Features auf einem korrekten Bild aufbauen._
