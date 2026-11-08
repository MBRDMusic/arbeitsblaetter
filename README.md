# Arbeitsblätter digital

Webapp für den Unterricht: Schüler wählen auf einer Übersicht ein Arbeitsblatt und bearbeiten es auf dem
iPad: Felder ausfüllen, ankreuzen, beschriften, mit dem Finger zeichnen, markieren und Flächen ausmalen.
Alles wird automatisch **nur auf dem Gerät** gespeichert (IndexedDB), es werden keine Schülerdaten übertragen.

Adresse: https://mbrdmusic.github.io/arbeitsblaetter/

## Schutz der Verlagsinhalte

Die Seiten stammen aus einem Verlags-Arbeitsheft. Deshalb liegen im öffentlichen Repo **nur verschlüsselte
Bilder** (`docs/daten/*.bin`, AES-GCM, Schlüssel per PBKDF2 aus dem Klassenpasswort). Ohne Passwort ist
nichts zu sehen. Die Originalfotos in `vorlagen/` und Zwischenstände in `build/` sind per `.gitignore`
ausgeschlossen und werden nie veröffentlicht.

## Veröffentlichen / Passwort ändern

```bash
./veroeffentlichen.sh
```

Das Skript fragt verdeckt nach dem Klassenpasswort, verschlüsselt alle Seiten neu und pusht.
Bleibt das Passwort gleich, bleiben die Anmeldungen auf den iPads gültig; bei einem neuen Passwort
fragt die App beim nächsten Öffnen einmal danach. GitHub Pages braucht danach 1–2 Minuten.

## Neue Seite hinzufügen

1. Foto als `vorlagen/Seite XX.jpeg` ablegen.
2. In `docs/seiten.json` einen Eintrag ergänzen: `{"id": "XX", "nr": "…", "titel": "…", "felder": [...]}`.
3. `./veroeffentlichen.sh`

Ein Feld ist `[id, typ, x, y, breite, höhe]`, Koordinaten relativ zur Bildgröße (0–1).
Typen: `text` (einzeilig), `lang` (mehrzeilig), `kreuz` (✗ per Antippen), `haken` (✓ per Antippen).
Die `id` eines Felds nie ändern, sonst passen gespeicherte Eingaben nicht mehr.
Mit `?debug` in der Adresse (z. B. `…/arbeitsblaetter/?debug#/seite/03`) werden alle Felder rot umrandet.

## Lokal testen

```bash
python3 -m http.server 8124 --directory docs
```

Für lokale Tests mit Testpasswort: `BLATT_PASSWORT=… node tools/bauen.mjs`

## Aufbau

- `docs/` – die veröffentlichte Webapp (statisch, ohne Build-Schritt)
  - `js/app.js` – Passwort, Übersicht, Routing
  - `js/blatt.js` – Bearbeitungsansicht mit Werkzeugen und automatischem Speichern
  - `js/fuellen.js` – Füll-Eimer (Flächenerkennung im Foto)
  - `js/krypto.js`, `js/speicher.js` – Entschlüsselung, lokale Speicherung
- `tools/bauen.mjs` – verkleinert und verschlüsselt die Fotos (braucht macOS `sips` und Node)
