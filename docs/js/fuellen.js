// Füll-Eimer: findet die zusammenhängende Fläche um den angetippten Punkt im Foto des Arbeitsblatts.
// Grenzen sind dunkle Linien bzw. deutlich andere Farben. Gemalt wird nicht ins Foto, sondern in
// eine eigene Malebene, sodass erneutes Füllen die Farbe einer Fläche einfach ersetzt.

const TOLERANZ = 70; // Summe der RGB-Abweichungen zur angetippten Farbe
const DUNKEL = 110; // Helligkeit, unter der ein Pixel immer als Linie gilt
const MAX_ANTEIL = 0.2; // größer als 20 % der Seite = Fläche ist offensichtlich nicht geschlossen

/**
 * Berechnet die Füllmaske.
 * @param {ImageData} basis Pixel des Fotos
 * @returns {{maske: Uint8Array, x0:number, y0:number, x1:number, y1:number} | null} null, wenn die Fläche ausläuft
 */
export function flaecheFinden(basis, sx, sy) {
  const { width: w, height: h, data: d } = basis;
  sx = Math.round(sx);
  sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const i0 = (sy * w + sx) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
  const passt = (p) => {
    const i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (0.3 * r + 0.59 * g + 0.11 * b < DUNKEL) return false;
    return Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) <= TOLERANZ;
  };
  if (!passt(sy * w + sx)) return null;

  const maske = new Uint8Array(w * h);
  const grenze = w * h * MAX_ANTEIL;
  let anzahl = 0;
  let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
  const stapel = [sx, sy];
  // Scanline-Füllung
  while (stapel.length) {
    const y = stapel.pop();
    let x = stapel.pop();
    let p = y * w + x;
    while (x > 0 && !maske[p - 1] && passt(p - 1)) {
      x--;
      p--;
    }
    let obenOffen = false;
    let untenOffen = false;
    while (x < w && !maske[p] && passt(p)) {
      maske[p] = 1;
      if (++anzahl > grenze) return null;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y > 0) {
        const o = p - w;
        if (!maske[o] && passt(o)) {
          if (!obenOffen) {
            stapel.push(x, y - 1);
            obenOffen = true;
          }
        } else obenOffen = false;
      }
      if (y < h - 1) {
        const u = p + w;
        if (!maske[u] && passt(u)) {
          if (!untenOffen) {
            stapel.push(x, y + 1);
            untenOffen = true;
          }
        } else untenOffen = false;
      }
      x++;
      p++;
    }
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }

  // Maske um 2 Pixel erweitern, damit an weichen Kanten kein weißer Saum bleibt.
  for (let runde = 0; runde < 2; runde++) {
    const kopie = maske.slice();
    const ya = Math.max(1, y0 - 1), yb = Math.min(h - 2, y1 + 1);
    const xa = Math.max(1, x0 - 1), xb = Math.min(w - 2, x1 + 1);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const p = y * w + x;
        if (!kopie[p] && (kopie[p - 1] || kopie[p + 1] || kopie[p - w] || kopie[p + w])) maske[p] = 1;
      }
    }
    x0 = xa; x1 = xb; y0 = ya; y1 = yb;
  }
  return { maske, x0, y0, x1, y1 };
}
