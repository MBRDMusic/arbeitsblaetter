// Entschlüsselt die Seitenbilder im Browser (AES-GCM, Schlüssel per PBKDF2 aus dem Klassenpasswort).
// Der abgeleitete Schlüssel wird lokal gemerkt, damit das Passwort nur einmal pro Gerät nötig ist.

const MERKER = "arbeitsblatt-schluessel";
let schluessel = null;
let info = null;

const ausB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const zuB64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));

async function infoLaden() {
  if (!info) {
    const r = await fetch("daten/schluessel.json", { cache: "no-store" });
    if (!r.ok) throw new Error("Die Seite ist noch nicht eingerichtet (schluessel.json fehlt).");
    info = await r.json();
  }
  return info;
}

async function entschluesselnMit(key, daten) {
  const u = new Uint8Array(daten);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, key, u.slice(12));
}

async function probeBesteht(key) {
  try {
    const klar = await entschluesselnMit(key, ausB64(info.probe));
    return new TextDecoder().decode(klar) === "arbeitsblatt-ok";
  } catch {
    return false;
  }
}

/** Versucht, einen gemerkten Schlüssel zu laden. Liefert true, wenn er noch passt. */
export async function gemerktenSchluesselLaden() {
  await infoLaden();
  let gemerkt = null;
  try {
    gemerkt = JSON.parse(localStorage.getItem(MERKER) || "null");
  } catch {
    gemerkt = null;
  }
  if (!gemerkt || gemerkt.salt !== info.salt) return false;
  const key = await crypto.subtle.importKey("raw", ausB64(gemerkt.roh), "AES-GCM", false, ["decrypt"]);
  if (!(await probeBesteht(key))) return false;
  schluessel = key;
  return true;
}

/** Leitet den Schlüssel aus dem Passwort ab. Liefert false bei falschem Passwort. */
export async function anmelden(passwort) {
  await infoLaden();
  const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort.trim()), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: ausB64(info.salt), iterations: info.iterationen },
    basis,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
  if (!(await probeBesteht(key))) return false;
  schluessel = key;
  try {
    const roh = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(MERKER, JSON.stringify({ salt: info.salt, roh: zuB64(roh) }));
  } catch {
    // Ohne lokalen Speicher (z. B. privates Surfen) muss das Passwort beim nächsten Mal erneut eingegeben werden.
  }
  return true;
}

/** Gemerkten Schlüssel verwerfen (beim nächsten Start wird nach dem Passwort gefragt). */
export function schluesselVergessen() {
  schluessel = null;
  info = null;
  cache.clear();
  try {
    localStorage.removeItem(MERKER);
  } catch {
    // nichts zu tun
  }
}

export class SchluesselVeraltet extends Error {
  constructor() {
    super("Das Passwort hat sich geändert. Bitte gib es neu ein.");
  }
}

const cache = new Map();

/** Lädt und entschlüsselt ein Bild; liefert einen Blob (JPEG). */
export async function bildLaden(name) {
  if (cache.has(name)) return cache.get(name);
  const versprechen = (async () => {
    const r = await fetch(`daten/${name}.bin?v=${encodeURIComponent(info.stand || "")}`);
    if (!r.ok) throw new Error("Die Seite konnte nicht geladen werden. Ist das Gerät mit dem Internet verbunden?");
    let klar;
    try {
      klar = await entschluesselnMit(schluessel, await r.arrayBuffer());
    } catch {
      // Passt nicht mehr (z. B. neues Passwort seit dem letzten Besuch): neu anmelden lassen.
      schluesselVergessen();
      throw new SchluesselVeraltet();
    }
    return new Blob([klar], { type: "image/jpeg" });
  })();
  cache.set(name, versprechen);
  versprechen.catch(() => cache.delete(name));
  return versprechen;
}
