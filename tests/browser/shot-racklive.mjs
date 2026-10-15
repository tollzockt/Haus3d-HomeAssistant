// Schrank bestücken, Panel: Status-LEDs eingebauter Geräte folgen ihrer Entität (grün, aus, rot), Antippen eines eingebauten Geräts
// öffnet die Infos statt zu schalten (auch knapp daneben; frei stehende Geräte schalten wie bisher), Info-Tafel des Schranks mit
// Geräten, Leistung gesamt (W und kW) und Status-Punkten, offene Tür im Panel.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const pg = await t.page("racklive", "", { width: 1280, height: 800 });
const E = (fn, arg) => pg.evaluate(fn, arg);

/** Zustände setzen (wie ein Zustandswechsel in Home Assistant): {entity: [Zustand, Attribute]}. */
const setStates = (o) =>
  E((o) => {
    const h = window.hass;
    const states = { ...h.states };
    for (const [id, [state, attributes = {}]] of Object.entries(o)) {
      const now = new Date().toISOString();
      states[id] = { entity_id: id, state, attributes: { friendly_name: id, ...attributes }, last_changed: now, last_updated: now };
    }
    window.hass = { ...h, states };
    window.panel.hass = window.hass;
  }, o);

await setStates({
  "switch.test_server": ["on"],
  "binary_sensor.test_usv_problem": ["off", { device_class: "problem" }],
  "binary_sensor.test_switch_verbindung": ["on", { device_class: "connectivity" }],
  "sensor.test_srv_leistung": ["250", { unit_of_measurement: "W", device_class: "power" }],
  "sensor.test_usv_leistung": ["0.2", { unit_of_measurement: "kW", device_class: "power" }],
  "sensor.test_usv_last": ["35", { unit_of_measurement: "%" }],
  "switch.test_nas_frei": ["off"],
});

/** Schrank im Flur der EG mit USV (HE 1–2), Server (HE 3) und Switch (HE 4), dazu ein frei stehendes NAS daneben. */
const build = (extra = {}) =>
  E(async (extra) => {
    const p = window.panel;
    const { followMoves } = await import("/custom_components/haus3d/frontend/follow.js");
    const { TECH_PACK } = await import("/custom_components/haus3d/frontend/catalog-tech.js");
    const b = structuredClone(p._building);
    const eg = b.floors.find((f) => f.id === "eg");
    eg.furniture = eg.furniture.filter((m) => !/^t_/.test(m.id));
    const before = structuredClone(eg);
    const dim = (type) => {
      const [, w, d, h] = TECH_PACK.items[type];
      return { w, d, h };
    };
    const at = { x: 9.5, z: 5.9, rotation: 0 };
    eg.furniture.push(
      { id: "t_cab", type: "network_cabinet", ...at, w: 0.6, d: 0.6, h: 1.2, ...extra },
      { id: "t_usv", type: "tech_ups_2u", ...at, ...dim("tech_ups_2u"), name: "USV", entity: "binary_sensor.test_usv_problem", info: [{ entity: "sensor.test_usv_leistung", name: "Leistung" }, { entity: "sensor.test_usv_last", name: "Last" }] },
      { id: "t_srv", type: "tech_srv_1u", ...at, ...dim("tech_srv_1u"), name: "Server", entity: "switch.test_server", info: [{ entity: "sensor.test_srv_leistung", name: "Leistung" }] },
      { id: "t_sw", type: "tech_switch_24", ...at, ...dim("tech_switch_24"), name: "Switch", entity: "binary_sensor.test_switch_verbindung" },
    );
    followMoves(before, eg);
    eg.furniture.push({ id: "t_nas", type: "tech_nas_2bay", x: 10.5, z: 5.9, rotation: 0, entity: "switch.test_nas_frei" });
    p._setBuilding(b, p._revision, { keepCamera: true });
    p._setFilter("eg");
  }, extra);

const look = (target, from) =>
  E(
    ([c, f]) => {
      const sc = window.panel._scene;
      sc.controls.target.set(...c);
      sc.camera.position.set(...f);
      sc.controls.update();
      sc._dirty = true;
      sc._kick?.();
    },
    [target, from],
  );

/** Wände aus- bzw. einblenden (für Bilder von vorn: die Südwand des Flurs verdeckt sonst den Schrank). */
const wallsOff = (off) =>
  E((off) => {
    const sc = window.panel._scene;
    sc.setLayers({ ...sc.layers, walls: !off });
  }, off);

/** Farbzustand der Status-LEDs eines Möbelstücks im Panel: {green: n, off: n, red: n}. */
const leds = (id) =>
  E(async (id) => {
    const { ledMats } = await import("/custom_components/haus3d/frontend/tech-parts.js");
    const sc = window.panel._scene;
    const mats = ledMats(sc.furnMats);
    let obj = null;
    sc.root.traverse((o) => {
      if (!obj && o.userData.furniture === id && o.parent?.userData.furniture !== id) obj = o;
    });
    const kinds = {};
    obj?.traverse((o) => {
      const k = o.isMesh ? Object.keys(mats).find((key) => mats[key] === o.material) : null;
      if (k) kinds[k] = (kinds[k] ?? 0) + 1;
    });
    return kinds;
  }, id);

/** Bildschirmpunkt (client) der Vorderseite eines Möbelstücks im Panel. */
const where = (id, { dy = 0 } = {}) =>
  E(
    async ([id, dy]) => {
      const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
      const sc = window.panel._scene;
      sc.camera.updateMatrixWorld(true);
      sc.camera.matrixWorldInverse.copy(sc.camera.matrixWorld).invert();
      let obj = null;
      sc.root.traverse((o) => {
        if (!obj && o.userData.furniture === id && o.parent?.userData.furniture !== id) obj = o;
      });
      if (!obj) return null;
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      c.z = box.max.z - 0.003;
      c.y += dy;
      c.project(sc.camera);
      const r = sc.renderer.domElement.getBoundingClientRect();
      return [r.left + ((c.x + 1) / 2) * r.width, r.top + ((1 - c.y) / 2) * r.height];
    },
    [id, dy],
  );

const services = () => E(() => window.calls.filter((c) => c.domain).map((c) => `${c.domain}.${c.service}:${c.entity_id}`));
const events = () => E(() => [...window.events]);

// ---------------------------------------------------------------- A Status-LEDs folgen der Entität
await build();
await pg.waitForTimeout(700);
const l0 = await leds("t_srv");
const nSrv = l0.green ?? 0;
t.results.leds = { server: l0, usv: await leds("t_usv"), switch: await leds("t_sw") };
t.check(nSrv >= 4 && Object.keys(l0).join() === "green", `Server an: alle LEDs grün: ${JSON.stringify(l0)}`);
t.check(Object.keys(await leds("t_usv")).join() === "green", `USV (Störungsmelder aus): grün: ${JSON.stringify(await leds("t_usv"))}`);
t.check(Object.keys(await leds("t_sw")).join() === "green" && (await leds("t_sw")).green >= 24, `Switch (Verbindung an): grün, alle Port-LEDs: ${JSON.stringify(await leds("t_sw"))}`);
await wallsOff(true);
await look([9.5, 0.62, 5.9], [9.5, 1.6, 7.7]);
await pg.waitForTimeout(500);
await t.shot(pg, "racklive-gruen.png");

await setStates({ "switch.test_server": ["off"], "binary_sensor.test_usv_problem": ["on", { device_class: "problem" }], "binary_sensor.test_switch_verbindung": ["off", { device_class: "connectivity" }] });
await pg.waitForTimeout(400);
const l1 = { server: await leds("t_srv"), usv: await leds("t_usv"), switch: await leds("t_sw") };
t.results.leds2 = l1;
t.check(Object.keys(l1.server).join() === "off" && l1.server.off === nSrv, `Server aus: grau: ${JSON.stringify(l1.server)}`);
t.check(Object.keys(l1.usv).join() === "red", `USV Störung: rot: ${JSON.stringify(l1.usv)}`);
t.check(Object.keys(l1.switch).join() === "red", `Switch Verbindung weg: rot: ${JSON.stringify(l1.switch)}`);
await t.shot(pg, "racklive-aus-rot.png");

await setStates({ "switch.test_server": ["unavailable"] });
await pg.waitForTimeout(300);
t.check(Object.keys(await leds("t_srv")).join() === "red", `Server nicht erreichbar: rot: ${JSON.stringify(await leds("t_srv"))}`);
await setStates({ "switch.test_server": ["on"], "binary_sensor.test_usv_problem": ["off", { device_class: "problem" }], "binary_sensor.test_switch_verbindung": ["on", { device_class: "connectivity" }] });
await pg.waitForTimeout(300);
t.check(Object.keys(await leds("t_srv")).join() === "green" && Object.keys(await leds("t_usv")).join() === "green" && Object.keys(await leds("t_sw")).join() === "green", "alles wieder grün");

// ---------------------------------------------------------------- B Antippen eines eingebauten Geräts öffnet die Infos
await wallsOff(false);
const tap = await E(() => [...window.panel._scene.infoTap].sort());
t.check(tap.join() === "binary_sensor.test_switch_verbindung,binary_sensor.test_usv_problem,switch.test_server", `infoTap: ${tap}`);
await look([9.5, 0.62, 5.9], [9.5, 6, 9.6]);
await pg.waitForTimeout(600);
await E(() => ((window.calls.length = 0), (window.events.length = 0)));
const srvAt = await where("t_srv");
const hit = await E(([x, y]) => window.panel._scene.pick(x, y), srvAt);
t.results.pick = hit;
t.check(hit?.entity_id === "switch.test_server" && hit.info === true, `Tipp auf den Server meldet info: ${JSON.stringify(hit)}`);
const hitUsv = await E(([x, y]) => window.panel._scene.pick(x, y), await where("t_usv"));
t.check(hitUsv?.entity_id === "binary_sensor.test_usv_problem" && hitUsv.info === true, `USV: ${JSON.stringify(hitUsv)}`);
// knapp daneben (auf dem Schrankrahmen neben dem Gerät): das nächste Gerät, ebenfalls Infos
const near = await E(([x, y]) => window.panel._scene.pick(x + 8, y - 6), srvAt);
t.check(near?.entity_id && near.info === true, `knapp daneben: ${JSON.stringify(near)}`);
await pg.mouse.click(srvAt[0], srvAt[1]);
await pg.waitForTimeout(500);
t.check((await events()).at(-1) === "switch.test_server", `Antippen öffnet die Infos: ${JSON.stringify(await events())}`);
t.check((await services()).length === 0, `kein Dienstaufruf beim Antippen eines eingebauten Geräts: ${JSON.stringify(await services())}`);
await t.shot(pg, "racklive-tippen.png");

// Gegenprobe: das frei stehende NAS daneben schaltet wie bisher, ohne info
const nasAt = await where("t_nas");
const nasHit = await E(([x, y]) => window.panel._scene.pick(x, y), nasAt);
t.check(nasHit?.entity_id === "switch.test_nas_frei" && !nasHit.info, `freies Gerät ohne info: ${JSON.stringify(nasHit)}`);
await E(() => ((window.calls.length = 0), (window.events.length = 0)));
await pg.mouse.click(nasAt[0], nasAt[1]);
await pg.waitForTimeout(500);
t.check((await services()).join() === "switch.toggle:switch.test_nas_frei" &&(await events()).length === 0, `frei stehendes Gerät schaltet: ${JSON.stringify(await services())}`);
// Gedrückthalten öffnet auch hier die Infos (wie bisher)
await E(() => (window.events.length = 0));
await pg.mouse.move(srvAt[0], srvAt[1]);
await pg.mouse.down();
await pg.waitForTimeout(900);
await pg.mouse.up();
await pg.waitForTimeout(300);
t.check((await events()).at(-1) === "switch.test_server", `Gedrückthalten: ${JSON.stringify(await events())}`);

// ---------------------------------------------------------------- C Info-Tafel des Schranks
await E(() => window.panel._holoClear());
await look([9.5, 0.6, 5.9], [9.5, 8, 11]);
await pg.waitForTimeout(500);
await E(() => ((window.calls.length = 0), (window.events.length = 0)));
await E(() => window.panel._focusRoom({ floorId: "eg", roomId: "flur" }));
await pg.waitForTimeout(1300);
const card = () =>
  E(() => {
    const els = [...window.panel.shadowRoot.querySelectorAll(".holo")];
    const c = els[0];
    const rows = [...(c?.querySelectorAll(".hololine") ?? [])].map((x) => ({
      name: x.querySelector("span").textContent,
      value: x.querySelector("b").textContent,
      cls: x.className.replace("hololine", "").trim(),
      led: x.querySelector(".hololed")?.className.replace("hololed", "").trim() ?? null,
      tag: x.tagName.toLowerCase(),
      entity: x.dataset.entity ?? null,
    }));
    return { tafeln: els.length, head: c?.querySelector(".holohead")?.textContent, rows };
  });
const c0 = await card();
t.results.tafel = c0;
t.check(c0.tafeln === 1 && c0.head === "Netzwerkschrank", `eine Tafel am Schrank: ${JSON.stringify(c0)}`);
const names = c0.rows.map((r) => `${r.cls.includes("holoind") ? "  " : ""}${r.name}`);
t.check(names.join("|") === "Leistung gesamt|Switch|Server|  Leistung|USV|  Leistung|  Last", `Zeilen (Summe, Geräte von oben, Werte eingerückt): ${names.join("|")}`);
const row = (n, i = 0) => c0.rows.filter((r) => r.name === n)[i];
t.check(row("Leistung gesamt")?.value === "450 W" && row("Leistung gesamt").tag === "div", `Leistung gesamt in W: ${JSON.stringify(row("Leistung gesamt"))}`);
t.check(row("Server")?.led === "green" && row("Server").value === "an" && row("Server").tag === "button" && row("Server").entity === "switch.test_server", `Server: ${JSON.stringify(row("Server"))}`);
t.check(row("USV")?.led === "green" && row("USV").value === "aus" && row("Switch")?.led === "green" && row("Switch").value === "an", `USV und Switch: ${JSON.stringify([row("USV"), row("Switch")])}`);
t.check(row("Leistung", 1)?.value === "0,2 kW" && row("Last")?.value === "35 %", `eingerückte Werte: ${JSON.stringify([row("Leistung", 1), row("Last")])}`);
await t.shot(pg, "racklive-tafel.png");

// live: Leistung über 1000 W → kW; LED-Punkte folgen den Zuständen; Summe verschwindet ohne gültigen Wert
await setStates({ "sensor.test_usv_leistung": ["1", { unit_of_measurement: "kW", device_class: "power" }], "switch.test_server": ["off"], "binary_sensor.test_usv_problem": ["on", { device_class: "problem" }] });
await pg.waitForTimeout(400);
const c1 = await card();
const r1 = (n) => c1.rows.find((r) => r.name === n);
t.check(r1("Leistung gesamt")?.value === "1,25 kW", `Leistung gesamt in kW: ${r1("Leistung gesamt")?.value}`);
t.check(r1("Server")?.led === "off" && r1("Server").value === "aus" && r1("USV")?.led === "red", `Punkte live: ${JSON.stringify([r1("Server"), r1("USV")])}`);
t.check(c1.tafeln === 1, `weiter eine Tafel: ${c1.tafeln}`);
await setStates({ "sensor.test_srv_leistung": ["unavailable", { unit_of_measurement: "W" }], "sensor.test_usv_leistung": ["unknown", { unit_of_measurement: "kW" }] });
await pg.waitForTimeout(400);
const c2 = await card();
t.check(!c2.rows.some((r) => r.name === "Leistung gesamt") && c2.tafeln === 1, `ohne gültigen Leistungswert keine Summenzeile (Tafel neu gebaut): ${JSON.stringify(c2.rows.map((r) => r.name))}`);
await setStates({ "sensor.test_srv_leistung": ["300", { unit_of_measurement: "W" }] });
await pg.waitForTimeout(400);
t.check((await card()).rows.find((r) => r.name === "Leistung gesamt")?.value === "300 W", "Summe kommt wieder");

// Antippen einer Zeile mit Entität öffnet die Infos, keine Dienstaufrufe
await E(() => (window.events.length = 0));
await pg.locator('haus3d-panel .holo .holodev[data-entity="switch.test_server"]').click();
await pg.waitForTimeout(300);
t.check((await events()).at(-1) === "switch.test_server" && (await services()).length === 0, `Zeile öffnet Infos: ${JSON.stringify(await events())} / ${JSON.stringify(await services())}`);
// beobachtet: auch die Werte der Geräte (Info-Entitäten)
const watched = await E(() => window.panel._holoIds());
t.check(["sensor.test_srv_leistung", "sensor.test_usv_leistung", "sensor.test_usv_last", "switch.test_server"].every((e) => watched.includes(e)), `beobachtet: ${watched}`);
await E(() => window.panel._holoClear());

// ---------------------------------------------------------------- D Tür offen im Panel
await setStates({ "switch.test_server": ["on"], "binary_sensor.test_usv_problem": ["off", { device_class: "problem" }] });
const doorAngle = () =>
  E(() => {
    let a = null;
    window.panel._scene.root.traverse((o) => {
      if (a === null && o.userData.furniture === "t_cab" && o.name === "door") a = o.rotation.y;
    });
    return a;
  });
t.check(Math.abs(await doorAngle()) < 1e-6, `Tür zu: ${await doorAngle()}`);
await build({ open: true });
await pg.waitForTimeout(600);
const open = await doorAngle();
t.check(Math.abs(open + (100 * Math.PI) / 180) < 0.01, `Tür offen im Panel um 100° nach außen: ${open}`);
t.check(Object.keys(await leds("t_srv")).join() === "green", "LEDs nach dem Neuaufbau (Tür offen) wieder nach dem Zustand");
await wallsOff(true);
await look([9.5, 0.62, 5.9], [9.0, 1.7, 7.7]);
await pg.waitForTimeout(500);
await t.shot(pg, "racklive-tuer-offen.png");
await wallsOff(false);
// offene Tür: Geräte weiter antippbar (Infos)
const open2 = await E(([x, y]) => window.panel._scene.pick(x, y), await where("t_srv"));
t.check(open2?.entity_id === "switch.test_server" && open2.info === true, `Gerät hinter der offenen Tür antippbar: ${JSON.stringify(open2)}`);

// ---------------------------------------------------------------- E Tafel mit vielen Zeilen: höchstens 12, dann „+ n weitere“
await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const srv = b.floors.find((f) => f.id === "eg").furniture.find((m) => m.id === "t_srv");
  srv.info = Array.from({ length: 10 }, (_, i) => ({ entity: i ? `sensor.test_srv_wert${i}` : "sensor.test_srv_leistung", name: i ? `Wert ${i}` : "Leistung" }));
  p._setBuilding(b, p._revision, { keepCamera: true });
  p._setFilter("eg");
  p._focusRoom({ floorId: "eg", roomId: "flur" });
});
await pg.waitForTimeout(1300);
const c3 = await card();
const last = c3.rows.at(-1);
t.check(c3.tafeln === 1 && c3.rows.length === 13 && last.name === "+ 4 weitere" && last.tag === "div" && last.cls.includes("holomore"), `höchstens 12 Zeilen und „+ 4 weitere“: ${JSON.stringify(c3.rows.map((r) => r.name))}`);
t.check(c3.rows.slice(0, 12).filter((r) => r.name === "Leistung gesamt").length === 1, "Leistung gesamt bleibt vorn");
await t.shot(pg, "racklive-viele.png");

await t.done();
