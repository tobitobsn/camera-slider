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
| Preset | Ein gespeichertes Fahrprofil (Name, Start-/Endpunkt, Geschwindigkeit/Dauer) | der Nutzer selbst, nur lokal auf dem Handy |

> Kein "zuletzt verbundenes Gerät" (Stand PROJ-1): Die App scannt bei jedem Start per Service-UUID neu und verbindet sich automatisch zum ersten passenden Treffer — kein gespeicherter Geräte-Bezug nötig. Entschieden im `/write-spec`-Interview zu PROJ-1, 2026-09-22.

## Beziehungen

Keine — Presets stehen für sich, unabhängig von der (nicht persistierten) Geräteverbindung.

## Diagramm (optional)

```
Preset (lokal)
```

---

_Dies ist ein lebendes Dokument. Wenn `/architecture` ein Feature designt, das eine Entität einführt oder ändert, wird diese Karte zuerst aktualisiert, damit spätere Features auf einem korrekten Bild aufbauen._
