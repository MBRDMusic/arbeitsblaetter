// Bearbeitungsansicht einer Arbeitsblattseite: Foto, Malebene (Stift, Marker, Füllen, Radierer)
// und vorbereitete Eingabefelder (Text, Kreuz, Haken). Speichert automatisch lokal.

import { bildLaden } from "./krypto.js";
import { seiteLaden, seiteSpeichern, seiteLoeschen } from "./speicher.js";
import { flaecheFinden } from "./fuellen.js";

const FARBEN = [
  ["#1f2937", "Schwarz"], ["#8a8f98", "Grau"], ["#6d4423", "Dunkelbraun"], ["#b7793f", "Braun"],
  ["#e53935", "Rot"], ["#fb8c00", "Orange"], ["#fdd835", "Gelb"], ["#fff3a0", "Hellgelb"],
  ["#9ccc65", "Hellgrün"], ["#2e7d32", "Dunkelgrün"], ["#81d4fa", "Hellblau"], ["#1e4fd8", "Dunkelblau"],
  ["#8e24aa", "Lila"], ["#f48fb1", "Rosa"],
];

const WERKZEUGE = [
  ["schreiben", "Schreiben", '<path d="M4 19h16M7 15l5-11 5 11M9 11h6"/>'],
  ["beschriften", "Beschriften", '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10v4M10 10H6M13 14h5"/>'],
  ["stift", "Stift", '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3"/>'],
  ["marker", "Marker", '<path d="M5 20h6M9 16l-3-3 8-8 3 3-8 8zM6 13l-2 4 3 0"/>'],
  ["fuellen", "Füllen", '<path d="M5 11l6-6 7 7-6 6a2 2 0 01-3 0l-4-4a2 2 0 010-3zM5 11h13M20 15s-2 2.5-2 4a2 2 0 004 0c0-1.5-2-4-2-4z"/>'],
  ["radierer", "Radierer", '<path d="M8 20h12M5 15l9-10 6 6-9 9H9l-4-4z"/>'],
];

const BREITE = { stift: 5, marker: 30, radierer: 34 }; // in Bildpixeln
const MARKER_DECKKRAFT = 0.4;
const MAX_RUECKGAENGIG = 30;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

const svg = (pfad) => `<svg viewBox="0 0 24 24" aria-hidden="true">${pfad}</svg>`;
const hexZuRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Öffnet eine Seite in `wurzel`. Liefert eine Aufräumfunktion (speichert vor dem Verlassen).
 */
export async function blattOeffnen(seite, wurzel, { zurueck, debug }) {
  const z = {
    werkzeug: "schreiben",
    farbe: FARBEN[11][0],
    zoom: 1,
    felder: {},
    frei: [], // frei platzierte Beschriftungen: {id, x, y, text}
    rueckgaengig: [],
    malGeaendert: false,
    malBlob: null,
    basis: null,
  };

  wurzel.innerHTML = `
    <header class="blatt-kopf">
      <div class="zeile">
        <button class="knopf zurueck" data-aktion="zurueck" aria-label="Zur Übersicht">${svg('<path d="M15 5l-7 7 7 7"/>')}<span>Übersicht</span></button>
        <h1>${seite.nr ? `<span class="nr">${seite.nr}</span>` : ""}${seite.titel}</h1>
        <div class="gruppe">
          <button class="knopf" data-aktion="rueckgaengig" aria-label="Rückgängig" disabled>${svg('<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>')}</button>
          <button class="knopf" data-aktion="kleiner" aria-label="Verkleinern">${svg('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M16 16l4 4"/>')}</button>
          <button class="knopf" data-aktion="groesser" aria-label="Vergrößern">${svg('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M16 16l4 4"/>')}</button>
          <button class="knopf" data-aktion="leeren" aria-label="Seite leeren">${svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button>
        </div>
      </div>
      <div class="zeile werkzeugleiste">
        <div class="werkzeuge" role="radiogroup" aria-label="Werkzeug">
          ${WERKZEUGE.map(([id, name, pfad]) => `<button class="werkzeug" role="radio" data-werkzeug="${id}" aria-checked="false">${svg(pfad)}<span>${name}</span></button>`).join("")}
        </div>
        <div class="farben" role="radiogroup" aria-label="Farbe">
          ${FARBEN.map(([hex, name]) => `<button class="farbe" role="radio" data-farbe="${hex}" style="--f:${hex}" aria-label="${name}" aria-checked="false"></button>`).join("")}
        </div>
      </div>
    </header>
    <main class="blatt-scroller">
      <div class="blatt-seite${debug ? " debug" : ""}">
        <img class="foto" alt="${seite.titel}" draggable="false">
        <canvas class="mal"></canvas>
        <canvas class="live"></canvas>
        <div class="felder"></div>
        <div class="eingabe"></div>
      </div>
      <div class="laden">Seite wird geladen …</div>
    </main>
    <div class="hinweis" role="status" aria-live="polite"></div>
  `;

  const $ = (s) => wurzel.querySelector(s);
  const scroller = $(".blatt-scroller");
  const blatt = $(".blatt-seite");
  const foto = $(".foto");
  const mal = $(".mal");
  const live = $(".live");
  const felderEbene = $(".felder");
  const eingabe = $(".eingabe");
  const hinweisEl = $(".hinweis");
  const malCtx = mal.getContext("2d", { willReadFrequently: true });
  const liveCtx = live.getContext("2d");

  let hinweisTimer = 0;
  function hinweis(text) {
    hinweisEl.textContent = text;
    hinweisEl.classList.add("sichtbar");
    clearTimeout(hinweisTimer);
    hinweisTimer = setTimeout(() => hinweisEl.classList.remove("sichtbar"), 3200);
  }

  // ---------- Laden ----------
  const [blob, gespeichert] = await Promise.all([bildLaden(seite.id), seiteLaden(seite.id)]);
  const fotoUrl = URL.createObjectURL(blob);
  foto.src = fotoUrl;
  await foto.decode();
  const W = foto.naturalWidth;
  const H = foto.naturalHeight;
  for (const c of [mal, live]) {
    c.width = W;
    c.height = H;
  }
  blatt.style.aspectRatio = `${W} / ${H}`;
  $(".laden").remove();

  if (gespeichert) {
    z.felder = gespeichert.felder || {};
    z.frei = gespeichert.frei || [];
    if (gespeichert.mal) {
      z.malBlob = gespeichert.mal;
      const bmp = await createImageBitmap(gespeichert.mal);
      malCtx.drawImage(bmp, 0, 0);
      bmp.close?.();
    }
  }

  // ---------- Felder ----------
  const verhaeltnis = H / W;
  for (const [id, typ, x, y, w, h] of seite.felder) {
    let el;
    if (typ === "kreuz" || typ === "haken") {
      el = document.createElement("button");
      el.type = "button";
      el.className = `feld ankreuzen ${typ}`;
      el.setAttribute("aria-pressed", z.felder[id] ? "true" : "false");
      el.setAttribute("aria-label", typ === "kreuz" ? "Ankreuzen" : "Abhaken");
      el.addEventListener("click", () => {
        const an = !z.felder[id];
        if (an) z.felder[id] = true;
        else delete z.felder[id];
        el.setAttribute("aria-pressed", an ? "true" : "false");
        speichernPlanen();
      });
      el.style.fontSize = `${Math.min(w, h * verhaeltnis) * 85}cqw`;
    } else {
      const lang = typ === "lang";
      el = document.createElement(lang ? "textarea" : "input");
      el.className = `feld text${lang ? " lang" : ""}${w * 1000 < 70 ? " schmal" : ""}`;
      if (!lang) el.type = "text";
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("spellcheck", "false");
      el.setAttribute("aria-label", "Antwort");
      el.value = z.felder[id] || "";
      el.addEventListener("input", () => {
        if (el.value) z.felder[id] = el.value;
        else delete z.felder[id];
        speichernPlanen();
      });
      el.style.fontSize = lang ? "2.1cqw" : `${Math.min(h * verhaeltnis * 100 * 0.6, 2.4)}cqw`;
    }
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.width = `${w * 100}%`;
    el.style.height = `${h * 100}%`;
    el.dataset.id = id;
    felderEbene.appendChild(el);
  }

  // ---------- Freie Beschriftungen ----------
  function breiteAnpassen(el) {
    el.style.width = `${Math.max(2.2, el.value.length * 0.62 + 1.2)}em`;
  }
  function beschriftungAnlegen(eintrag) {
    const el = document.createElement("input");
    el.type = "text";
    el.className = "feld text frei";
    el.setAttribute("autocomplete", "off");
    el.setAttribute("autocorrect", "off");
    el.setAttribute("spellcheck", "false");
    el.setAttribute("aria-label", "Beschriftung");
    el.value = eintrag.text;
    el.style.left = `${eintrag.x * 100}%`;
    el.style.top = `${eintrag.y * 100}%`;
    breiteAnpassen(el);
    el.addEventListener("input", () => {
      eintrag.text = el.value;
      breiteAnpassen(el);
      speichernPlanen();
    });
    el.addEventListener("blur", () => {
      if (el.value.trim()) return;
      el.remove();
      z.frei = z.frei.filter((f) => f !== eintrag);
      speichernPlanen();
    });
    felderEbene.appendChild(el);
    return el;
  }
  for (const eintrag of z.frei) beschriftungAnlegen(eintrag);

  // ---------- Speichern ----------
  let speicherTimer = 0;
  let speicherLauf = Promise.resolve();
  function speichernPlanen() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(speichernJetzt, 700);
  }
  function speichernJetzt() {
    clearTimeout(speicherTimer);
    speicherLauf = speicherLauf.then(async () => {
      if (z.malGeaendert) {
        z.malGeaendert = false;
        z.malBlob = await new Promise((r) => mal.toBlob(r, "image/png"));
      }
      const frei = z.frei.filter((f) => f.text.trim()).map(({ id, x, y, text }) => ({ id, x, y, text }));
      await seiteSpeichern(seite.id, { felder: z.felder, frei, mal: z.malBlob });
    }).catch(() => hinweis("Speichern hat nicht geklappt. Ist der Speicher voll?"));
    return speicherLauf;
  }
  const beimVerstecken = () => {
    if (document.visibilityState === "hidden") speichernJetzt();
  };
  document.addEventListener("visibilitychange", beimVerstecken);
  window.addEventListener("pagehide", speichernJetzt);

  // ---------- Rückgängig ----------
  const rueckKnopf = $('[data-aktion="rueckgaengig"]');
  function sichern(x0, y0, x1, y1) {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1));
    y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    z.rueckgaengig.push({ x: x0, y: y0, daten: malCtx.getImageData(x0, y0, x1 - x0, y1 - y0) });
    if (z.rueckgaengig.length > MAX_RUECKGAENGIG) z.rueckgaengig.shift();
    rueckKnopf.disabled = false;
  }
  function rueckgaengig() {
    const e = z.rueckgaengig.pop();
    if (!e) return;
    malCtx.putImageData(e.daten, e.x, e.y);
    rueckKnopf.disabled = z.rueckgaengig.length === 0;
    z.malGeaendert = true;
    speichernPlanen();
  }

  // ---------- Werkzeuge ----------
  function werkzeugWaehlen(id) {
    z.werkzeug = id;
    blatt.dataset.werkzeug = id;
    for (const b of wurzel.querySelectorAll("[data-werkzeug]")) b.setAttribute("aria-checked", String(b.dataset.werkzeug === id));
    $(".farben").classList.toggle("aus", !["stift", "marker", "fuellen"].includes(id));
    if (id !== "schreiben" && id !== "beschriften") document.activeElement?.blur?.();
  }
  function farbeWaehlen(hex) {
    z.farbe = hex;
    for (const b of wurzel.querySelectorAll("[data-farbe]")) b.setAttribute("aria-checked", String(b.dataset.farbe === hex));
  }
  werkzeugWaehlen("schreiben");
  farbeWaehlen(z.farbe);

  // ---------- Zoom ----------
  function seitenbreite() {
    return scroller.clientWidth - 2 * parseFloat(getComputedStyle(scroller).paddingLeft || "0");
  }
  function zoomSetzen(neu, fx, fy) {
    neu = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, neu));
    const sr = scroller.getBoundingClientRect();
    if (fx === undefined) {
      fx = sr.left + sr.width / 2;
      fy = sr.top + sr.height / 2;
    }
    const br = blatt.getBoundingClientRect();
    const ax = (fx - br.left) / br.width;
    const ay = (fy - br.top) / br.height;
    z.zoom = neu;
    blatt.style.width = `${seitenbreite() * neu}px`;
    const nb = blatt.getBoundingClientRect();
    scroller.scrollLeft += nb.left + ax * nb.width - fx;
    scroller.scrollTop += nb.top + ay * nb.height - fy;
  }
  const beiGroesse = () => zoomSetzen(z.zoom);
  window.addEventListener("resize", beiGroesse);
  zoomSetzen(1);

  // Safari: Zwei-Finger-Zoom im Schreiben-Modus (sonst würde die ganze Oberfläche gezoomt)
  let gestenStart = 1;
  const gestureStart = (e) => {
    e.preventDefault();
    gestenStart = z.zoom;
  };
  const gestureChange = (e) => {
    e.preventDefault();
    if (z.werkzeug === "schreiben" && e.scale) zoomSetzen(gestenStart * e.scale, e.clientX, e.clientY);
  };
  document.addEventListener("gesturestart", gestureStart);
  document.addEventListener("gesturechange", gestureChange);
  scroller.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomSetzen(z.zoom * Math.exp(-e.deltaY / 200), e.clientX, e.clientY);
  }, { passive: false });

  // ---------- Malen ----------
  const zeiger = new Map();
  let strich = null; // { punkte, x0,y0,x1,y1, vorher? }
  let geste = null;

  function bildpunkt(e) {
    const r = blatt.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }

  function strichBeginnen(e) {
    const [x, y] = bildpunkt(e);
    const breite = BREITE[z.werkzeug];
    strich = { punkte: [[x, y]], x0: x, y0: y, x1: x, y1: y, breite };
    if (z.werkzeug === "radierer") {
      strich.vorher = malCtx.getImageData(0, 0, W, H);
      malCtx.save();
      malCtx.globalCompositeOperation = "destination-out";
    }
    const ctx = z.werkzeug === "radierer" ? malCtx : liveCtx;
    live.style.opacity = z.werkzeug === "marker" ? String(MARKER_DECKKRAFT) : "1";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = breite;
    ctx.strokeStyle = z.werkzeug === "radierer" ? "#000" : z.farbe;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(x, y, breite / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function strichWeiter(e) {
    const ctx = z.werkzeug === "radierer" ? malCtx : liveCtx;
    const ereignisse = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of ereignisse.length ? ereignisse : [e]) {
      const p = bildpunkt(ev);
      const pk = strich.punkte;
      const a = pk[pk.length - 1];
      const b = pk.length > 1 ? pk[pk.length - 2] : a;
      pk.push(p);
      ctx.beginPath();
      ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + p[0]) / 2, (a[1] + p[1]) / 2);
      ctx.stroke();
      strich.x0 = Math.min(strich.x0, p[0]);
      strich.y0 = Math.min(strich.y0, p[1]);
      strich.x1 = Math.max(strich.x1, p[0]);
      strich.y1 = Math.max(strich.y1, p[1]);
    }
  }

  function strichAbschliessen() {
    if (!strich) return;
    const r = strich.breite;
    const [x0, y0, x1, y1] = [strich.x0 - r, strich.y0 - r, strich.x1 + r, strich.y1 + r];
    if (z.werkzeug === "radierer") {
      malCtx.restore();
      const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0));
      const bx = Math.min(W, Math.ceil(x1)), by = Math.min(H, Math.ceil(y1));
      // Vorher-Zustand nur im betroffenen Ausschnitt aufheben
      const tmp = document.createElement("canvas");
      tmp.width = W;
      tmp.height = H;
      const tctx = tmp.getContext("2d");
      tctx.putImageData(strich.vorher, 0, 0);
      z.rueckgaengig.push({ x: ax, y: ay, daten: tctx.getImageData(ax, ay, bx - ax, by - ay) });
      if (z.rueckgaengig.length > MAX_RUECKGAENGIG) z.rueckgaengig.shift();
      rueckKnopf.disabled = false;
    } else {
      sichern(x0, y0, x1, y1);
      malCtx.save();
      malCtx.globalAlpha = z.werkzeug === "marker" ? MARKER_DECKKRAFT : 1;
      malCtx.drawImage(live, 0, 0);
      malCtx.restore();
      liveCtx.clearRect(0, 0, W, H);
    }
    strich = null;
    z.malGeaendert = true;
    speichernPlanen();
  }

  function strichVerwerfen() {
    if (!strich) return;
    if (z.werkzeug === "radierer") {
      malCtx.restore();
      malCtx.putImageData(strich.vorher, 0, 0);
    } else {
      liveCtx.clearRect(0, 0, W, H);
    }
    strich = null;
  }

  function basisPixel() {
    if (!z.basis) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(foto, 0, 0);
      z.basis = ctx.getImageData(0, 0, W, H);
    }
    return z.basis;
  }

  function fuellen(e) {
    const [x, y] = bildpunkt(e);
    const f = flaecheFinden(basisPixel(), x, y);
    if (!f) {
      hinweis("Hier geht Füllen nicht: Tippe in eine helle, rundum umrandete Fläche.");
      return;
    }
    const { maske, x0, y0, x1, y1 } = f;
    sichern(x0, y0, x1 + 1, y1 + 1);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const bild = malCtx.getImageData(x0, y0, bw, bh);
    const [r, g, b] = hexZuRgb(z.farbe);
    for (let yy = 0; yy < bh; yy++) {
      for (let xx = 0; xx < bw; xx++) {
        if (maske[(y0 + yy) * W + x0 + xx]) {
          const i = (yy * bw + xx) * 4;
          bild.data[i] = r;
          bild.data[i + 1] = g;
          bild.data[i + 2] = b;
          bild.data[i + 3] = 255;
        }
      }
    }
    malCtx.putImageData(bild, x0, y0);
    z.malGeaendert = true;
    speichernPlanen();
  }

  function gesteStarten() {
    const [a, b] = [...zeiger.values()];
    geste = {
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      abstand: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: z.zoom,
    };
  }

  // Beschriften über "click", weil iOS die Tastatur nur in einem echten Klick-Ereignis öffnet.
  eingabe.addEventListener("click", (e) => {
    if (z.werkzeug !== "beschriften") return;
    const r = blatt.getBoundingClientRect();
    const fontPx = parseFloat(getComputedStyle(felderEbene).fontSize) || 16;
    const eintrag = {
      id: `f${Date.now().toString(36)}`,
      x: Math.min(0.97, (e.clientX - r.left) / r.width),
      y: Math.min(0.98, Math.max(0, (e.clientY - r.top - fontPx * 0.8) / r.height)),
      text: "",
    };
    z.frei.push(eintrag);
    beschriftungAnlegen(eintrag).focus();
  });

  eingabe.addEventListener("pointerdown", (e) => {
    if (z.werkzeug === "schreiben" || z.werkzeug === "beschriften") return;
    e.preventDefault();
    eingabe.setPointerCapture(e.pointerId);
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zeiger.size === 1) {
      if (z.werkzeug === "fuellen") return; // Füllen erst beim Loslassen, falls doch eine Zwei-Finger-Geste folgt
      strichBeginnen(e);
    } else if (zeiger.size === 2) {
      strichVerwerfen();
      gesteStarten();
    }
  });
  eingabe.addEventListener("pointermove", (e) => {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (geste && zeiger.size >= 2) {
      const [a, b] = [...zeiger.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const faktor = Math.hypot(a.x - b.x, a.y - b.y) / geste.abstand;
      scroller.scrollLeft -= mx - geste.mx;
      scroller.scrollTop -= my - geste.my;
      geste.mx = mx;
      geste.my = my;
      if (Math.abs(faktor - 1) > 0.02) zoomSetzen(geste.zoom * faktor, mx, my);
    } else if (strich) {
      strichWeiter(e);
    }
  });
  const loslassen = (e) => {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.delete(e.pointerId);
    if (geste) {
      if (zeiger.size === 0) geste = null;
      return;
    }
    if (e.type === "pointercancel") {
      strichVerwerfen();
      return;
    }
    if (z.werkzeug === "fuellen") fuellen(e);
    else strichAbschliessen();
  };
  eingabe.addEventListener("pointerup", loslassen);
  eingabe.addEventListener("pointercancel", loslassen);

  // ---------- Knöpfe ----------
  wurzel.addEventListener("click", async (e) => {
    const w = e.target.closest("[data-werkzeug]");
    if (w) return werkzeugWaehlen(w.dataset.werkzeug);
    const f = e.target.closest("[data-farbe]");
    if (f) {
      if (z.werkzeug === "schreiben" || z.werkzeug === "radierer") werkzeugWaehlen("stift");
      return farbeWaehlen(f.dataset.farbe);
    }
    const a = e.target.closest("[data-aktion]")?.dataset.aktion;
    if (a === "zurueck") zurueck();
    else if (a === "rueckgaengig") rueckgaengig();
    else if (a === "groesser") zoomSetzen(z.zoom * 1.4);
    else if (a === "kleiner") zoomSetzen(z.zoom / 1.4);
    else if (a === "leeren") {
      if (!confirm("Alles auf dieser Seite löschen? Das kann nicht rückgängig gemacht werden.")) return;
      clearTimeout(speicherTimer);
      malCtx.clearRect(0, 0, W, H);
      z.felder = {};
      z.frei = [];
      for (const el of [...felderEbene.querySelectorAll(".frei")]) el.remove();
      z.malBlob = null;
      z.malGeaendert = false;
      z.rueckgaengig = [];
      rueckKnopf.disabled = true;
      for (const el of felderEbene.children) {
        if (el.tagName === "BUTTON") el.setAttribute("aria-pressed", "false");
        else el.value = "";
      }
      await speicherLauf;
      await seiteLoeschen(seite.id);
      hinweis("Die Seite ist wieder leer.");
    }
  });

  return async function schliessen() {
    document.removeEventListener("visibilitychange", beimVerstecken);
    window.removeEventListener("pagehide", speichernJetzt);
    window.removeEventListener("resize", beiGroesse);
    document.removeEventListener("gesturestart", gestureStart);
    document.removeEventListener("gesturechange", gestureChange);
    const offen = Object.keys(z.felder).length > 0 || z.frei.length > 0 || z.malGeaendert || z.malBlob;
    if (offen) await speichernJetzt();
    URL.revokeObjectURL(fotoUrl);
  };
}
