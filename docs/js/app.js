// Einstieg: Passwortabfrage, Übersicht der Arbeitsblätter, Bearbeitungsansicht (Hash-Routing).

import { gemerktenSchluesselLaden, anmelden, bildLaden, SchluesselVeraltet } from "./krypto.js";
import { begonneneSeiten } from "./speicher.js";
import { blattOeffnen } from "./blatt.js";

const app = document.getElementById("app");
const debug = new URLSearchParams(location.search).has("debug");
let daten = null;
let schliessen = null;
let routeNr = 0;
let angemeldet = false;

async function seitenLaden() {
  if (!daten) {
    const r = await fetch("seiten.json", { cache: "no-cache" });
    daten = await r.json();
  }
  return daten;
}

function sperreZeigen() {
  document.body.dataset.ansicht = "sperre";
  app.innerHTML = `
    <section class="sperre">
      <form class="karte" autocomplete="off">
        <div class="symbol" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
        </div>
        <h1>Arbeitsblätter</h1>
        <p>Gib das Passwort ein, das du von deiner Lehrkraft bekommen hast.</p>
        <label class="unsichtbar" for="pw">Passwort</label>
        <input id="pw" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Passwort" required>
        <button type="submit" class="haupt">Öffnen</button>
        <p class="fehler" role="alert"></p>
      </form>
    </section>`;
  const form = app.querySelector("form");
  const fehler = app.querySelector(".fehler");
  const knopf = form.querySelector("button");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    knopf.disabled = true;
    knopf.textContent = "Wird geprüft …";
    fehler.textContent = "";
    try {
      if (await anmelden(form.pw.value)) {
        angemeldet = true;
        route();
        return;
      }
      fehler.textContent = "Das Passwort stimmt nicht. Versuch es noch einmal.";
    } catch (err) {
      fehler.textContent = err.message;
    }
    knopf.disabled = false;
    knopf.textContent = "Öffnen";
    form.pw.select();
  });
  form.pw.focus();
}

async function uebersichtZeigen() {
  document.body.dataset.ansicht = "uebersicht";
  const { titel, seiten } = await seitenLaden();
  const begonnen = await begonneneSeiten();
  app.innerHTML = `
    <section class="uebersicht">
      <header>
        <h1>${titel}</h1>
        <p>Such dir ein Arbeitsblatt aus. Deine Eingaben werden automatisch auf diesem Gerät gespeichert.</p>
      </header>
      <ul class="raster">
        ${seiten.map((s) => `
          <li>
            <a class="kachel" href="#/seite/${s.id}">
              <div class="vorschau"><img alt="" data-mini="${s.id}"></div>
              <div class="unterschrift">
                ${s.nr ? `<span class="nr">${s.nr}</span>` : ""}
                <span class="titel">${s.titel}</span>
                ${begonnen.has(s.id) ? '<span class="marke">angefangen</span>' : ""}
              </div>
            </a>
          </li>`).join("")}
      </ul>
    </section>`;
  for (const img of app.querySelectorAll("img[data-mini]")) {
    bildLaden(`${img.dataset.mini}-mini`)
      .then((b) => {
        img.src = URL.createObjectURL(b);
        img.onload = () => {
          img.classList.add("da");
          URL.revokeObjectURL(img.src);
        };
      })
      .catch((err) => {
        if (err instanceof SchluesselVeraltet) location.reload();
        else img.closest(".vorschau").classList.add("fehlt");
      });
  }
}

async function route() {
  const nr = ++routeNr;
  if (schliessen) {
    const s = schliessen;
    schliessen = null;
    await s();
  }
  if (nr !== routeNr) return;
  const m = location.hash.match(/^#\/seite\/([\w-]+)/);
  if (!m) return uebersichtZeigen();
  const { seiten } = await seitenLaden();
  const seite = seiten.find((s) => s.id === m[1]);
  if (!seite) {
    location.hash = "";
    return;
  }
  document.body.dataset.ansicht = "blatt";
  try {
    const s = await blattOeffnen(seite, app, { zurueck: () => (location.hash = ""), debug });
    if (nr !== routeNr) await s();
    else schliessen = s;
  } catch (err) {
    if (err instanceof SchluesselVeraltet) return location.reload();
    app.innerHTML = `<section class="sperre"><div class="karte"><h1>Das hat nicht geklappt</h1><p>${err.message || "Bitte lade die Seite neu."}</p><a class="haupt" href="#">Zur Übersicht</a></div></section>`;
  }
}

async function start() {
  // Der Listener muss auch nach einer frischen Passworteingabe aktiv sein, nicht nur mit gemerktem Schlüssel.
  window.addEventListener("hashchange", () => {
    if (angemeldet) route();
  });
  try {
    if (!(await gemerktenSchluesselLaden())) return sperreZeigen();
  } catch (err) {
    app.innerHTML = `<section class="sperre"><div class="karte"><h1>Noch nicht bereit</h1><p>${err.message}</p></div></section>`;
    return;
  }
  angemeldet = true;
  route();
}

start();
