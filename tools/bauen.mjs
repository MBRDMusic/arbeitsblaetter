#!/usr/bin/env node
// Baut die verschlüsselten Seitenbilder für die Webapp.
//
// Liest die Fotos aus vorlagen/ ("Seite XX.jpeg"), verkleinert sie mit sips (macOS),
// verschlüsselt sie mit AES-GCM (Schlüssel per PBKDF2 aus dem Klassenpasswort) und legt
// sie in docs/daten/ ab. Nur diese verschlüsselten Dateien werden veröffentlicht.
//
// Aufruf:  node tools/bauen.mjs
// Das Passwort wird verdeckt abgefragt (oder aus der Umgebungsvariable BLATT_PASSWORT gelesen).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const vorlagen = join(wurzel, "vorlagen");
const arbeit = join(wurzel, "build", "arbeit");
const ziel = join(wurzel, "docs", "daten");
const ITERATIONEN = 600_000;
const GROSS = 2300; // längste Kante der Seitenbilder in Pixeln
const MINI = 520; // längste Kante der Vorschaubilder

function passwortAbfragen() {
  if (process.env.BLATT_PASSWORT) return Promise.resolve(process.env.BLATT_PASSWORT);
  if (!process.stdin.isTTY) {
    console.error("Kein Terminal für die Passworteingabe. BLATT_PASSWORT setzen oder im Terminal starten.");
    process.exit(1);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let verdeckt = false;
    rl._writeToOutput = (s) => rl.output.write(verdeckt ? (s.includes("\n") ? "\n" : "") : s);
    rl.question("Klassenpasswort (wird nicht angezeigt): ", (a) => {
      rl.close();
      resolve(a);
    });
    verdeckt = true;
  });
}

async function schluesselAbleiten(passwort, salt) {
  const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONEN },
    basis,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function verschluesseln(schluessel, daten) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, schluessel, daten));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

function verkleinern(quelle, zielDatei, kante, qualitaet) {
  execFileSync("sips", ["-Z", String(kante), "-s", "format", "jpeg", "-s", "formatOptions", String(qualitaet), quelle, "--out", zielDatei], { stdio: "ignore" });
  return readFileSync(zielDatei);
}

const seiten = JSON.parse(readFileSync(join(wurzel, "docs", "seiten.json"), "utf8")).seiten;
const passwort = await passwortAbfragen();
if (passwort.length < 6) {
  console.error("Das Passwort sollte mindestens 6 Zeichen haben.");
  process.exit(1);
}

mkdirSync(arbeit, { recursive: true });
mkdirSync(ziel, { recursive: true });
for (const f of readdirSync(ziel)) if (f.endsWith(".bin")) unlinkSync(join(ziel, f));

// Bleibt das Passwort gleich, bleibt auch das Salt gleich: Dann gilt der auf den iPads gemerkte
// Schlüssel weiter und niemand muss das Passwort nach einer Aktualisierung erneut eingeben.
async function bisherigesSalt() {
  const datei = join(ziel, "schluessel.json");
  if (!existsSync(datei)) return null;
  try {
    const alt = JSON.parse(readFileSync(datei, "utf8"));
    const salt = new Uint8Array(Buffer.from(alt.salt, "base64"));
    const probe = new Uint8Array(Buffer.from(alt.probe, "base64"));
    const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: alt.iterationen },
      basis,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: probe.slice(0, 12) }, key, probe.slice(12));
    return alt.iterationen === ITERATIONEN ? salt : null;
  } catch {
    return null;
  }
}

const altesSalt = await bisherigesSalt();
const salt = altesSalt || crypto.getRandomValues(new Uint8Array(16));
console.log(altesSalt ? "Passwort unverändert – gespeicherte Anmeldungen bleiben gültig." : "Neues Passwort – alle geben es beim nächsten Öffnen einmal neu ein.");
const schluessel = await schluesselAbleiten(passwort, salt);
const probe = await verschluesseln(schluessel, new TextEncoder().encode("arbeitsblatt-ok"));
const b64 = (u) => Buffer.from(u).toString("base64");

for (const s of seiten) {
  const quelle = join(vorlagen, `Seite ${s.id}.jpeg`);
  if (!existsSync(quelle)) {
    console.error(`Fehlt: ${quelle}`);
    process.exit(1);
  }
  const gross = verkleinern(quelle, join(arbeit, `${s.id}.jpg`), GROSS, 78);
  const mini = verkleinern(quelle, join(arbeit, `${s.id}-mini.jpg`), MINI, 70);
  writeFileSync(join(ziel, `${s.id}.bin`), await verschluesseln(schluessel, gross));
  writeFileSync(join(ziel, `${s.id}-mini.bin`), await verschluesseln(schluessel, mini));
  console.log(`Seite ${s.id}: ${(gross.length / 1024).toFixed(0)} KB`);
}

writeFileSync(
  join(ziel, "schluessel.json"),
  JSON.stringify({ version: 1, salt: b64(salt), iterationen: ITERATIONEN, probe: b64(probe), stand: new Date().toISOString() }, null, 2) + "\n",
);
console.log(`Fertig: ${seiten.length} Seiten verschlüsselt in docs/daten/`);
