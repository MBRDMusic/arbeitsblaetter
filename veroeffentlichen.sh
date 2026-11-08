#!/bin/zsh
# Verschlüsselt die Arbeitsblätter mit dem Klassenpasswort und veröffentlicht sie auf GitHub Pages.
# Aufruf im Terminal:  ./veroeffentlichen.sh
set -euo pipefail
cd "${0:A:h}"

node tools/bauen.mjs

# Sicherheitsnetz: Unverschlüsselte Originale dürfen nie ins öffentliche Repo.
if git ls-files --error-unmatch vorlagen build >/dev/null 2>&1; then
  echo "Abbruch: vorlagen/ oder build/ ist in Git eingetragen. Bitte entfernen." >&2
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "Keine Änderungen zum Veröffentlichen."
else
  git commit -q -m "Arbeitsblätter aktualisiert ($(date '+%d.%m.%Y %H:%M'))"
  git push -q
  echo "Veröffentlicht. In 1–2 Minuten aktuell unter: https://mbrdmusic.github.io/arbeitsblaetter/"
fi
