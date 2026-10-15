// Zugang per PIN (ohne DOM, mit node testbar): aktuelle Freigabe (Token vom Server), Token an
// schreibende Befehle hängen, Eingabe im PIN-Feld. Falsche PINs lösen nichts aus.

let current = null; // {token, scope, at}

export const IDLE_MS = 10 * 60000;
export const PIN_MIN = 4;
export const PIN_MAX = 8;

export function setAccess(token, scope, now = Date.now()) {
  current = token ? { token, scope, at: now } : null;
}

export function clearAccess() {
  current = null;
}

/** Freigabe noch gültig? (10 min ohne Nutzung → weg) */
export function accessScope(now = Date.now()) {
  if (!current) return null;
  if (now - current.at > IDLE_MS) {
    current = null;
    return null;
  }
  return current.scope;
}

export function touchAccess(now = Date.now()) {
  if (current) current.at = now;
}

export const canEdit = (now) => ["edit", "admin"].includes(accessScope(now));
export const canAdmin = (now) => accessScope(now) === "admin";

/** Befehl mit Token (schreibende haus3d-Befehle). */
export function withToken(msg) {
  if (!current) return msg;
  touchAccess();
  return { ...msg, token: current.token };
}

export function currentToken() {
  return current?.token ?? null;
}

/**
 * PIN-Feld: Taste anwenden. key: "0".."9", "back", "clear".
 * @returns {{pin: string, check: boolean}} check = jetzt prüfen lassen (ab 4 Ziffern)
 */
export function pinKey(pin, key) {
  if (key === "clear") return { pin: "", check: false };
  if (key === "back") return { pin: pin.slice(0, -1), check: false };
  if (!/^[0-9]$/.test(key) || pin.length >= PIN_MAX) return { pin, check: false };
  const next = pin + key;
  return { pin: next, check: next.length >= PIN_MIN };
}

/** Neue PIN gültig? (4–8 Ziffern, beide Eingaben gleich) */
export function newPinError(a, b) {
  if (!/^[0-9]{4,8}$/.test(a ?? "")) return "4 bis 8 Ziffern";
  if (a !== b) return "Die beiden Eingaben stimmen nicht überein";
  return null;
}

/** Einstellungen, die nur mit der Admin-PIN gespeichert werden (wie ADMIN_SETTINGS in access.py). */
export const ADMIN_KEYS = ["energy", "alerts", "routines", "security", "safety", "doorbell", "weather", "climate", "season", "house_flow", "presence", "north", "daily"];

/**
 * Weiteres Haus dieses Browsers: {id, name, live, demo} oder null (= Mein Haus, immer echt).
 * Zwischenspeicher: maßgeblich ist die Antwort von building/get. Ein Demo-Haus ist nie „live“.
 */
export const HOUSE_KEY = "haus3d.house";
export function loadHouse(raw) {
  try {
    const h = JSON.parse(raw ?? "null");
    if (!h || typeof h.id !== "string" || !/^test[0-9]{1,30}$/.test(h.id)) return null;
    const demo = h.demo === true;
    return { id: h.id, name: String(h.name ?? (demo ? "Demo" : "Testhaus")), live: h.live === true && !demo, demo };
  } catch {
    return null;
  }
}

/** Befehle, die ins Testhaus umgeleitet werden (Grundriss, Verlauf, Bauplan-Foto). */
export const HOUSE_TYPES = /^haus3d\/(building|history|background)\//;
/** Befehle, die im Testhaus ohne „Geräte echt schalten“ nichts in Home Assistant tun dürfen. */
export const HOUSE_BLOCKED = ["haus3d/lock/unlock", "haus3d/climate/pause"];
/** Befehle, die im Testhaus nie gehen: dauerhafte Einstellungen des echten Hauses (PINs, Entwickler, Urlaub). */
export const HOUSE_ALWAYS_BLOCKED = ["haus3d/pin/set", "haus3d/dev/clear", "haus3d/dev/set", "haus3d/away/set"];

const houseError = (demo) => (demo ? Object.assign(new Error("Demo: nichts an Home Assistant geschickt"), { code: "demo", quiet: true }) : Object.assign(new Error("Testhaus: nichts an Home Assistant geschickt"), { code: "testhaus", quiet: true }));

/**
 * hass fürs Testhaus bzw. Demo-Haus: Grundriss-Befehle bekommen `house` (echtes Haus bleibt unberührt).
 * - Ohne `live` geht nichts an Geräte: Dienste, Tür, Heizung pausieren und Urlaub werden abgelehnt
 *   (Fehler mit quiet, onBlocked meldet es). In der Simulation (`sim`) schaltet die Simulation selbst.
 * - Immer gesperrt: Änderungen an der HA-Konfiguration (callApi außer GET, z. B. Szenen) und Befehle
 *   fürs echte Haus (PINs, Entwickler-Instanz) – auch mit `live` und in der Simulation.
 * - `demo` (Vorführhaus): gilt immer als Simulation und nie als `live`; `base` ist dann der Demo-Wrapper,
 *   der Dienste selbst simuliert (Fehlercode „demo“ statt „testhaus“).
 */
export function houseGuard(base, house, { live = false, sim = false, demo = false, onBlocked = () => {} } = {}) {
  if (!base || !house) return base;
  if (demo) {
    live = false;
    sim = true;
  }
  const h = Object.create(base);
  h.haus3dHouse = house;
  h.callWS = (msg, ...rest) => {
    const type = msg?.type ?? "";
    if (HOUSE_TYPES.test(type)) return base.callWS({ ...msg, house }, ...rest);
    if (HOUSE_ALWAYS_BLOCKED.includes(type) || (!live && HOUSE_BLOCKED.includes(type))) {
      onBlocked(type);
      return Promise.reject(houseError(demo));
    }
    return base.callWS(msg, ...rest);
  };
  if (!live && !sim) {
    h.callService = async (domain, service) => {
      onBlocked(`${domain}.${service}`);
      throw houseError(demo);
    };
  }
  if (base.callApi) {
    h.callApi = (method, path, ...rest) => {
      if (String(method).toUpperCase() === "GET") return base.callApi(method, path, ...rest);
      onBlocked(path);
      return Promise.reject(houseError(demo));
    };
  }
  return h;
}

/**
 * hass mit Tür-Schutz: lock.unlock und lock.open gehen an guard(service, data) (Tür-PIN), alles andere
 * unverändert an Home Assistant. Leichte Hülle (Object.create), Zustände bleiben die des echten hass.
 */
export function doorGuard(real, guard) {
  if (!real?.callService) return real;
  const h = Object.create(real);
  h.callService = (domain, service, data, ...rest) =>
    domain === "lock" && (service === "unlock" || service === "open") ? guard(service, data ?? {}) : real.callService(domain, service, data, ...rest);
  return h;
}
