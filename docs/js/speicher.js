// Speichert die Bearbeitung jeder Seite lokal im Browser (IndexedDB).
// Nichts davon verlässt das Gerät.

const DB_NAME = "arbeitsblaetter";
const STORE = "seiten";
let dbVersprechen = null;

function db() {
  if (!dbVersprechen) {
    dbVersprechen = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbVersprechen;
}

async function anfrage(modus, aktion) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, modus);
    const req = aktion(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Liefert {felder: {id: wert}, mal: Blob|null, geaendert: Zahl} oder null. */
export async function seiteLaden(id) {
  try {
    return (await anfrage("readonly", (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function seiteSpeichern(id, stand) {
  await anfrage("readwrite", (s) => s.put({ ...stand, geaendert: Date.now() }, id));
}

export async function seiteLoeschen(id) {
  await anfrage("readwrite", (s) => s.delete(id));
}

/** IDs aller Seiten, an denen schon gearbeitet wurde. */
export async function begonneneSeiten() {
  try {
    const keys = await anfrage("readonly", (s) => s.getAllKeys());
    return new Set(keys);
  } catch {
    return new Set();
  }
}
