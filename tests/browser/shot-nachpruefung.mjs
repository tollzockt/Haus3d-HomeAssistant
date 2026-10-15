// Nachprüfung 0.23.0 (Bedienung): Möbel mit Entität außerhalb der Räume antippbar (Whirlpool auf dem Rasen, Steckdose an der
// Fassade), aber nicht durch die Hauswand (Gartengerät dahinter, auch nicht „knapp daneben“; im Cyberpunk-Stil mit seinen
// durchsichtigen Wänden schon); eingebaute Geräte ohne Drehung/Höhe/Steuerkreuz/Drehgriff/Pfeile und ohne leere Rückgängig-Schritte;
// Gerät im Schrank im Editor-3D durch die Glastür anklickbar, Ziehen daran nimmt den Schrank mit (baut das Gerät nicht aus);
// Live-Vorschau zieht Geräte im Schrank mit und blendet Rohre aus;
// dünne Randstein-Linie im Plan anwählbar, Art wechseln, keine wirkungslosen Felder; Schrank duplizieren; eine Info-Tafel
// für den Schrank samt Geräten.
import { start } from "./lib.mjs";

const t = await start(process.argv[2]);
const near = (a, b, tol = 1e-3) => Number.isFinite(a) && Math.abs(a - b) <= tol;

/** Schrank mit zwei Geräten (Server unten, USV darüber) und einer Netzwerkleitung am Server in den Flur der EG legen. */
const addRack = (pg, { info = false } = {}) =>
  pg.evaluate(async (info) => {
    const p = window.panel;
    const { followMoves } = await import("/custom_components/haus3d/frontend/follow.js");
    const { TECH_PACK } = await import("/custom_components/haus3d/frontend/catalog-tech.js");
    const b = structuredClone(p._building);
    const eg = b.floors.find((f) => f.id === "eg");
    const before = structuredClone(eg);
    const dim = (type) => {
      const [, w, d, h] = TECH_PACK.items[type];
      return { w, d, h };
    };
    const at = { x: 9.5, z: 5.9, rotation: 0 };
    eg.furniture.push(
      { id: "n_cab", type: "network_cabinet", ...at, w: 0.6, d: 0.6, h: 1.2, entity: "light.kueche" },
      { id: "n_srv", type: "tech_srv_1u", ...at, ...dim("tech_srv_1u"), ...(info ? { name: "Server", info: [{ entity: "sensor.wohnzimmer_temperatur", name: "Temperatur" }] } : {}) },
      { id: "n_ups", type: "tech_ups_2u", ...at, ...dim("tech_ups_2u"), ...(info ? { name: "USV", info: [{ entity: "sensor.kueche_temperatur", name: "Last" }, { entity: "sensor.bad_temperatur" }] } : {}) },
    );
    followMoves(before, eg);
    eg.pipes = [...(eg.pipes ?? []), { id: "n_pipe", type: "netzwerk", points: [[9.5, 6.2], [9.5, 6.9], [10.6, 6.9]], heights: [0.4, 0.4, 0.4], height: 0.4, ends: { a: { furniture: "n_srv" } } }];
    p._setBuilding(b, p._revision, { keepCamera: true });
  }, info);

// ---------------------------------------------------------------- A Hauptansicht: Möbel mit Entität außerhalb der Räume
const pg = await t.page("np-haupt", "");
const E = (fn, arg) => pg.evaluate(fn, arg);
await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  eg.furniture.push(
    { id: "n_tub", type: "garden_hot_tub_acryl", x: 15.5, z: -2.6, rotation: 0, entity: "switch.kaffeemaschine" }, // auf dem Rasen
    { id: "n_dose", type: "tech_socket", x: 3.5, z: -0.27, rotation: 180, mount_y: 0.6, entity: "light.kueche" }, // an der Fassade, außerhalb des Raums
  );
  Object.assign(p._settings.layers, { labels: false, devices: false, energy: false });
  p._applyOverlayLayers();
  p._setBuilding(b, p._revision, { keepCamera: true });
});
await pg.waitForTimeout(600);
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
/** Bildschirmpunkt (client) der Mitte eines Möbelstücks in der Hauptansicht (oder des Editor-3D). */
const where = (page, id, { editor = false, y = null, dz = 0, front = false } = {}) =>
  page.evaluate(
    async ([id, editor, y, dz, front]) => {
      const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
      const sc = editor ? window.panel._editor.scene3d : window.panel._scene;
      // Pose und Matrizen der Kamera auf den aktuellen Stand (der Abstand wird beim Setzen begrenzt, das nächste Bild kommt später)
      sc.camera.updateMatrixWorld(true);
      sc.camera.matrixWorldInverse.copy(sc.camera.matrixWorld).invert();
      let obj = null;
      sc.scene.traverse((o) => {
        if (!obj && o.userData.furniture === id && o.parent?.userData.furniture !== id) obj = o;
      });
      if (!obj) return null;
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      if (front) c.z = box.max.z - 0.003; // Mitte der Vorderseite (Drehung 0): davor liegt nichts Anderes
      if (y !== null) c.y = y;
      c.z += dz;
      c.project(sc.camera);
      const r = sc.renderer.domElement.getBoundingClientRect();
      return [r.left + ((c.x + 1) / 2) * r.width, r.top + ((1 - c.y) / 2) * r.height];
    },
    [id, editor, y, dz, front],
  );

// Whirlpool auf dem Rasen
await look([15.5, 0.4, -2.6], [13.5, 4, 2]);
await pg.waitForTimeout(700);
const tubAt = await where(pg, "n_tub");
const tubHit = await E(([x, y]) => window.panel._scene.pick(x, y), tubAt);
t.results.whirlpool = { at: tubAt, hit: tubHit };
t.check(tubHit?.entity_id === "switch.kaffeemaschine", `Whirlpool auf dem Rasen antippbar: ${JSON.stringify(tubHit)}`);
await E(() => (window.calls.length = 0));
await pg.mouse.click(tubAt[0], tubAt[1]);
await pg.waitForTimeout(500);
const tubCall = await E(() => window.calls.filter((c) => c.entity_id === "switch.kaffeemaschine"));
t.check(tubCall.length === 1, `Antippen schaltet den Whirlpool: ${JSON.stringify(tubCall)}`);
await t.shot(pg, "np-whirlpool.png");

// Steckdose an der Fassade (liegt außerhalb des Raums dahinter)
await look([3.5, 0.6, -0.27], [3.5, 1.4, -3.4]);
await pg.waitForTimeout(700);
const dosePt = await where(pg, "n_dose");
const doseHit = await E(([x, y]) => window.panel._scene.pick(x, y), dosePt);
t.check(doseHit?.entity_id === "light.kueche", `Außensteckdose antippbar (nicht der Raum dahinter): ${JSON.stringify(doseHit)}`);
// knapp daneben (im Umkreis des Fingers) zählt ebenfalls, statt des Raums
const doseNear = await E(([x, y]) => window.panel._scene.pick(x + 14, y + 10), dosePt);
t.check(doseNear?.entity_id === "light.kueche", `knapp daneben: ${JSON.stringify(doseNear)}`);
// weit weg an der Fassade: der Raum dahinter (oder nichts), keine Steckdose
const doseFar = await E(([x, y]) => window.panel._scene.pick(x + 200, y + 10), dosePt);
t.check(doseFar?.entity_id === undefined, `weit weg keine Steckdose: ${JSON.stringify(doseFar)}`);
await E(() => (window.calls.length = 0));
await pg.mouse.click(dosePt[0], dosePt[1]);
await pg.waitForTimeout(500);
t.check((await E(() => window.calls.filter((c) => c.entity_id === "light.kueche").length)) === 1, "Antippen schaltet die Außensteckdose");
await t.shot(pg, "np-aussensteckdose.png");
// Ebene „Möbel“ aus: nicht mehr antippbar
await E(() => window.panel._scene.setLayers?.({ ...window.panel._scene.layers, furniture: false }));
await pg.waitForTimeout(300);
const hidden = await E(([x, y]) => window.panel._scene.pick(x, y), dosePt);
t.check(hidden?.entity_id === undefined, `ohne Ebene Möbel nicht antippbar: ${JSON.stringify(hidden)}`);
await E(() => window.panel._scene.setLayers?.({ ...window.panel._scene.layers, furniture: true }));

// Gartengerät hinter dem Haus: von Süden liegt die Hauswand davor – Antippen der Wand schaltet es nicht (auch nicht
// „knapp daneben“); von Norden, wo es frei steht, geht es; Geräte in Räumen bleiben antippbar
await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.floors.find((f) => f.id === "eg").furniture.push({ id: "n_back", type: "garden_hot_tub_acryl", x: 8.5, z: -3.5, rotation: 0, entity: "light.hobbyraum" });
  p._setBuilding(b, p._revision, { keepCamera: true });
});
await look([8.5, 1.2, 5.5], [8.5, 2.2, 32]);
await pg.waitForTimeout(900);
const backAt = await where(pg, "n_back");
const back = await E(async ([x, y]) => {
  const { hiddenBehind, wallBlockers } = await import("/custom_components/haus3d/frontend/scene-pick.js");
  const THREE = await import("/custom_components/haus3d/frontend/vendor/three.module.min.js");
  const sc = window.panel._scene;
  let obj = null;
  sc.root.traverse((o) => {
    if (!obj && o.userData.furniture === "n_back" && o.parent?.userData.furniture !== "n_back") obj = o;
  });
  const mid = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  const r = sc.renderer.domElement.getBoundingClientRect();
  const pt = (dx, dy) => sc.pick(x + dx, y + dy);
  return {
    verdeckt: hiddenBehind(sc.camera, mid, wallBlockers(sc)),
    imBild: x > r.left && x < r.right && y > r.top && y < r.bottom,
    mitte: pt(0, 0),
    rundrum: [[0, -25], [0, 25], [-25, 0], [25, 0], [18, -18]].map(([dx, dy]) => pt(dx, dy)?.entity_id ?? null),
  };
}, backAt);
t.results.verdeckt = back;
t.check(back.verdeckt && back.imBild, `Testaufbau: Gartengerät hinter der Wand im Bild: ${JSON.stringify(back)}`);
t.check(back.mitte?.entity_id === undefined && back.rundrum.every((e) => e !== "light.hobbyraum"), `Hauswand vor dem Gartengerät schaltet es nicht: ${JSON.stringify(back)}`);
const switched = () => E(() => window.calls.filter((c) => c.entity_id === "light.hobbyraum").length);
await E(() => (window.calls.length = 0));
await pg.mouse.click(backAt[0], backAt[1]);
await pg.waitForTimeout(700);
t.check((await switched()) === 0, "Tippen auf die Hauswand schaltet das verdeckte Gartengerät nicht");
await t.shot(pg, "np-verdeckt.png");
await E(() => window.panel._setFilter("all"));
await look([8.5, 1.2, 5.5], [8.5, 2.2, 32]);
await pg.waitForTimeout(900);
await pg.mouse.click(backAt[0], backAt[1] - 22); // knapp daneben, auf der Fassade
await pg.waitForTimeout(400);
t.check((await switched()) === 0, "knapp neben dem verdeckten Gartengerät schaltet auch nichts");
await E(() => window.panel._setFilter("all"));
// frei sichtbar von Norden
await look([8.5, 0.4, -3.5], [8.5, 5, -12]);
await pg.waitForTimeout(700);
const backN = await where(pg, "n_back");
t.check((await E(([x, y]) => window.panel._scene.pick(x, y), backN))?.entity_id === "light.hobbyraum", "Gartengerät frei sichtbar: antippbar");
// Gerät im Raum (Schrank im Flur) von oben, Etage allein: antippbar, auch knapp daneben
await E(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  b.floors.find((f) => f.id === "eg").furniture.push({ id: "n_room", type: "network_cabinet", x: 9.5, z: 5.9, rotation: 0, w: 0.6, d: 0.6, h: 1.2, entity: "light.wohnzimmer_stehlampe" });
  p._setBuilding(b, p._revision, { keepCamera: true });
  p._setFilter("eg");
});
await look([9.5, 0.6, 5.9], [9.5, 14, 8]);
await pg.waitForTimeout(1200);
const roomAt = await where(pg, "n_room");
t.check((await E(([x, y]) => window.panel._scene.pick(x, y), roomAt))?.entity_id === "light.wohnzimmer_stehlampe", "Gerät im Raum antippbar");
t.check((await E(([x, y]) => window.panel._scene.pick(x + 12, y + 8), roomAt))?.entity_id === "light.wohnzimmer_stehlampe", "Gerät im Raum knapp daneben antippbar");
await E(() => window.panel._setFilter("all"));
// Cyberpunk: die Wände sind durchsichtig, das Gartengerät dahinter sieht man – und tippt es an
await E(async () => {
  window.panel._settings.style = "cyber";
  window.panel._applyStyle();
  await new Promise((r) => setTimeout(r, 1200));
});
await look([8.5, 1.2, 5.5], [8.5, 2.2, 32]);
await pg.waitForTimeout(900);
const backC = await where(pg, "n_back");
t.check((await E(([x, y]) => window.panel._scene.pick(x, y), backC))?.entity_id === "light.hobbyraum", "Cyberpunk: durch die durchsichtigen Wände antippbar");

// ---------------------------------------------------------------- B Info-Tafel für den Schrank
const hp = await t.page("np-holo", "");
const HE = (fn, arg) => hp.evaluate(fn, arg);
await addRack(hp, { info: true });
await hp.waitForTimeout(500);
await HE(() => {
  window.panel._setFilter("eg");
  window.panel._focusRoom({ floorId: "eg", roomId: "flur" });
});
await hp.waitForTimeout(1300);
const holo = await HE(() => {
  const els = [...window.panel.shadowRoot.querySelectorAll(".holo")];
  const card = els[0];
  return {
    tafeln: els.length,
    head: card?.querySelector(".holohead")?.textContent,
    subs: [...(card?.querySelectorAll(".holosub") ?? [])].map((x) => x.textContent),
    lines: [...(card?.querySelectorAll(".hololine") ?? [])].map((x) => [x.querySelector("span").textContent, x.querySelector("b").textContent]),
    ids: window.panel._holoIds(),
  };
});
t.results.holo = holo;
t.check(holo.tafeln === 1 && holo.head === "Netzwerkschrank", `eine Tafel am Schrank: ${JSON.stringify(holo)}`);
t.check(holo.subs.join() === "USV,Server", `Zwischenzeilen je Gerät (oberes zuerst): ${holo.subs}`);
t.check(holo.lines.length === 3 && holo.lines[0][0] === "Last" && holo.lines[0][1] === "23,9" && holo.lines[2][0] === "Temperatur" && /°C$/.test(holo.lines[2][1]), `Zeilen: ${JSON.stringify(holo.lines)}`);
t.check(holo.ids.length === 3, `beobachtete Entitäten: ${holo.ids}`);
await HE(() => {
  const h = window.hass;
  window.hass = { ...h, states: { ...h.states, "sensor.wohnzimmer_temperatur": { ...h.states["sensor.wohnzimmer_temperatur"], state: "30.5" } } };
  window.panel.hass = window.hass;
});
await hp.waitForTimeout(300);
t.check((await HE(() => window.panel.shadowRoot.querySelector(".holo .hololine:last-of-type b")?.textContent)) === "30,5 °C", "Wert in der Tafel des Schranks aktualisiert sich");
await t.shot(hp, "np-holo-schrank.png");

// ---------------------------------------------------------------- C Editor: Schrank mit Geräten, Randstein-Linie
const ed = await t.page("np-editor", "?power", { width: 1280, height: 800 });
await addRack(ed);
await ed.evaluate(() => {
  const p = window.panel;
  const b = structuredClone(p._building);
  const eg = b.floors.find((f) => f.id === "eg");
  // dünne Randstein-Linie (8 cm) südlich des Hauses
  eg.outdoor.push({ id: "n_kerb", type: "kerb", points: [[2, 9.96], [8, 9.96], [8, 10.04], [2, 10.04]], line: { points: [[2, 10], [8, 10]], width: 0.08 }, edge: "concrete", edge_h: 0.1 });
  p._setBuilding(b, p._revision, { keepCamera: true });
});
const D = (fn, arg) => ed.evaluate(fn, arg);
await D(() => window.panel._openEditor());
await ed.waitForTimeout(500);
await ed.locator("haus3d-panel .floorsel").selectOption("eg");
await ed.waitForTimeout(300);
const select = (kind, id) => D(([kind, id]) => {
  const e = window.panel._editor;
  e.sel = { kind, id };
  e.render();
  e.renderProps();
}, [kind, id]);
const item = (id) => D((id) => structuredClone(window.panel._editor.floor.furniture.find((m) => m.id === id) ?? null), id);
const undoLen = () => D(() => window.panel._editor.undoStack.length);
const props = () => D(() => window.panel._editor.props.innerText);
const zoomTo = async (x0, z0, x1, z1) => {
  await D((v) => {
    const e = window.panel._editor;
    e.view = v;
    e._fitPending = true;
    e.render();
  }, { x0, z0, x1, z1 });
  await ed.waitForTimeout(80);
};
await zoomTo(7, 4, 11, 7.5);
t.check((await item("n_srv"))?.in_rack === "n_cab" && (await item("n_ups"))?.in_rack === "n_cab", `Geräte eingebaut: ${JSON.stringify(await item("n_srv"))}`);

// --- eingebautes Gerät gewählt: keine Drehung, keine Höhe, kein Steuerkreuz, kein Drehgriff
await select("furniture", "n_srv");
const racked = await D(() => {
  const e = window.panel._editor;
  return { rotate: !!e.svg.querySelector('[data-kind="rotate"]'), pad: !!e.props.querySelector(".pad"), rot: !!e.props.querySelector("[data-num=rotation]"), mount: !!e.props.querySelector("[data-num=mount_y]"), unit: !!e.props.querySelector("[data-tech-u]"), out: !!e.props.querySelector("[data-tech-out]"), ent: !!e.props.querySelector("[data-m=entity]"), text: e.props.innerText };
});
t.results.eingebaut = racked;
t.check(!racked.rotate && !racked.pad && !racked.rot && !racked.mount, `eingebaut: keine Drehung/Höhe/Steuerkreuz/Drehgriff: ${JSON.stringify({ ...racked, text: undefined })}`);
t.check(racked.unit && racked.out && racked.ent && /Im Schrank: Netzwerkschrank/.test(racked.text), "Höheneinheit, Ausbauen und Entität bleiben");
// Pfeiltasten, R, Umschalt+R, Kurzmenü: nichts, kein Rückgängig-Schritt
const u0 = await undoLen();
const srv0 = await item("n_srv");
for (const key of ["ArrowRight", "ArrowDown", "Shift+ArrowLeft", "r", "Shift+R"]) await ed.keyboard.press(key);
await ed.waitForTimeout(150);
t.check((await undoLen()) === u0 && JSON.stringify(await item("n_srv")) === JSON.stringify(srv0), `Tasten ohne Wirkung und ohne Schritt: ${(await undoLen()) - u0}`);
await D(() => window.panel._editor._ctxMenu([300, 300]));
const ctxRack = await D(() => [...window.panel._editor.root.querySelectorAll(".ed-ctx button")].map((b) => b.textContent));
await D(() => window.panel._editor._closeCtx());
t.check(!ctxRack.includes("Drehen 90°") && !ctxRack.includes("An die Wand stellen") && ctxRack.includes("Löschen"), `Kurzmenü eingebaut: ${ctxRack}`);
// Schrank: alles da, Drehen ein Schritt samt Geräten
await select("furniture", "n_cab");
const cabUi = await D(() => {
  const e = window.panel._editor;
  return { rotate: !!e.svg.querySelector('[data-kind="rotate"]'), pad: !!e.props.querySelector(".pad"), rot: !!e.props.querySelector("[data-num=rotation]"), mount: !!e.props.querySelector("[data-num=mount_y]") };
});
t.check(cabUi.rotate && cabUi.pad && cabUi.rot && cabUi.mount, `Schrank: Drehgriff, Felder, Steuerkreuz: ${JSON.stringify(cabUi)}`);
await D(() => window.panel._editor._ctxMenu([300, 300]));
const ctxCab = await D(() => [...window.panel._editor.root.querySelectorAll(".ed-ctx button")].map((b) => b.textContent));
await D(() => window.panel._editor._closeCtx());
t.check(ctxCab.includes("Drehen 90°") && ctxCab.includes("An die Wand stellen"), `Kurzmenü Schrank: ${ctxCab}`);
const u1 = await undoLen();
await ed.keyboard.press("r");
await ed.waitForTimeout(100);
t.check((await undoLen()) === u1 + 1 && (await item("n_srv")).rotation === 90, "Schrank drehen: ein Schritt, Geräte drehen mit");
await ed.keyboard.press("Shift+R");
for (let i = 0; i < 5; i++) await ed.keyboard.press("Shift+R");
await ed.waitForTimeout(100);
t.check((await item("n_cab")).rotation === 0 && (await item("n_srv")).rotation === 0, "zurück auf 0°");

// --- Duplizieren: Schrank samt Geräten daneben, ohne Entitäten
const nFurn = await D(() => window.panel._editor.floor.furniture.length);
await select("furniture", "n_cab");
await ed.locator("haus3d-panel .ed-props [data-act=dup]").click();
await ed.waitForTimeout(250);
const dup = await D(() => {
  const e = window.panel._editor;
  const f = e.floor.furniture;
  const cab = f.find((m) => m.type === "network_cabinet" && m.id !== "n_cab");
  return { n: f.length, cab: cab && structuredClone(cab), devs: f.filter((m) => cab && m.in_rack === cab.id).map((m) => structuredClone(m)), sel: e.sel, multi: e.multi.length, orig: structuredClone(f.find((m) => m.id === "n_cab")), origDevs: f.filter((m) => m.in_rack === "n_cab").length };
});
t.results.duplikat = dup;
t.check(dup.n === nFurn + 3 && dup.cab && dup.devs.length === 2, `Schrank + zwei Geräte kopiert: ${JSON.stringify({ n: dup.n, devs: dup.devs.length })}`);
t.check(dup.cab.entity === null && dup.devs.every((m) => !m.entity), "Entitäten der Kopie leer");
t.check(dup.orig.entity === "light.kueche" && dup.origDevs === 2 && dup.orig.rack_used === 3, `Original unverändert: ${JSON.stringify(dup.orig)}`);
t.check(near(dup.cab.x, dup.orig.x + 0.7) && near(dup.cab.z, dup.orig.z) && dup.devs.every((m) => near(m.x, dup.cab.x)), `Kopie 0,7 m daneben, Geräte darin: ${dup.cab.x}`);
t.check(dup.sel?.id === dup.cab.id && dup.multi === 0 && dup.cab.rack_used === 3, `Kopie bleibt gewählt: ${JSON.stringify(dup.sel)}`);
await D(() => window.panel._editor.undo());
await ed.waitForTimeout(100);
t.check((await D(() => window.panel._editor.floor.furniture.length)) === nFurn, "ein Rückgängig-Schritt nimmt Schrank und Geräte zurück");

// --- Randstein-Linie: dünn, trotzdem anwählbar; Art wechseln; keine wirkungslosen Felder
await zoomTo(1, 8.5, 9, 11.5);
await select("furniture", "n_cab");
await D(() => {
  const e = window.panel._editor;
  e.sel = null;
  e.render();
  e.renderProps();
});
const topAt = (x, z, dpx = 0) => D(([x, z, dpx]) => {
  const e = window.panel._editor;
  const r = e.svg.getBoundingClientRect();
  const el = e.svg.getRootNode().elementFromPoint(r.left + e.tx + x * e.scale, r.top + e.tz + z * e.scale + dpx);
  const k = el?.closest?.("[data-kind]");
  return k ? `${k.dataset.kind}:${k.dataset.id}` : null;
}, [x, z, dpx]);
const scale = await D(() => window.panel._editor.scale);
t.check(scale * 0.08 < 6, `Band ist dünn (${(scale * 0.08).toFixed(1)} px)`);
t.check((await topAt(5, 10)) === "outdoor:n_kerb", `Mitte der Linie: ${await topAt(5, 10)}`);
t.check((await topAt(5, 10, 4)) === "outdoor:n_kerb" && (await topAt(5, 10, -4)) === "outdoor:n_kerb", `4 px neben der Linie: ${await topAt(5, 10, 4)} / ${await topAt(5, 10, -4)}`);
t.check((await topAt(5, 10, 12)) === "outdoor:rasen", `12 px daneben: Rasen (${await topAt(5, 10, 12)})`);
// echter Klick knapp neben dem Band
{
  const [sx, sy] = await D(() => {
    const e = window.panel._editor;
    const r = e.svg.getBoundingClientRect();
    return [r.left + e.tx + 5 * e.scale, r.top + e.tz + 10 * e.scale + 4];
  });
  await ed.mouse.click(sx, sy);
  await ed.waitForTimeout(150);
  const sel = await D(() => window.panel._editor.sel);
  t.check(sel?.kind === "outdoor" && sel.id === "n_kerb", `Klick neben das Band wählt die Linie: ${JSON.stringify(sel)}`);
}
const kerbUi = await D(() => {
  const e = window.panel._editor;
  return { text: e.props.innerText, tex: !!e.props.querySelector("[data-tex], [data-texrot]"), railing: !!e.props.querySelector("[data-g=railing], [data-g=railing_height]"), art: !!e.props.querySelector("[data-la=edge]"), area: !!e.props.querySelector("[data-g=area_id]") };
});
t.results.kerbFelder = kerbUi;
t.check(!kerbUi.tex && !kerbUi.railing && !/Textur|Geländer/.test(kerbUi.text) && kerbUi.art && kerbUi.area, `Randstein-Linie ohne Textur/Geländer: ${JSON.stringify({ ...kerbUi, text: undefined })}`);
// Art wechseln: Palisaden sind 10 cm breit und 30 cm hoch
await ed.locator("haus3d-panel .ed-props [data-la=edge]").selectOption("palisade");
await ed.waitForTimeout(150);
const pal = await D(() => {
  const e = window.panel._editor;
  const o = e.floor.outdoor.find((x) => x.id === "n_kerb");
  return { o: structuredClone(o), width: e.props.querySelector("[data-la=width]")?.value, h: e.props.querySelector("[data-la=edge_h]")?.value };
});
t.results.palisade = pal;
t.check(pal.o.edge === "palisade" && pal.o.line.width === 0.1 && pal.o.edge_h === undefined, `Palisade: Breite und Höhe der Art: ${JSON.stringify([pal.o.edge, pal.o.line.width, pal.o.edge_h])}`);
t.check(near(Math.abs(pal.o.points[2][1] - pal.o.points[1][1]), 0.1, 1e-6) && pal.width === "0.1" && pal.h === "0.3", `Fläche aus der Linie, Felder: ${pal.o.points[2][1] - pal.o.points[1][1]} ${pal.width} ${pal.h}`);
await ed.locator("haus3d-panel .ed-props [data-la=edge]").selectOption("metal");
await ed.waitForTimeout(150);
const met = await D(() => window.panel._editor.floor.outdoor.find((x) => x.id === "n_kerb"));
t.check(met.line.width === 0.005 && near(Math.abs(met.points[2][1] - met.points[1][1]), 0.005, 1e-6), `Metall: ${met.line.width}`);
// Rasen behält Textur und Geländer
await select("outdoor", "rasen");
t.check(await D(() => /Textur/.test(window.panel._editor.props.innerText) && /Geländer/.test(window.panel._editor.props.innerText)), "Rasen: Textur und Geländer da");
// Touch: breitere Trefferfläche
await D(() => {
  const e = window.panel._editor;
  e.coarse = true;
  e.render();
});
const hitW = await D(() => Number(window.panel._editor.svg.querySelector("[data-linehit]")?.getAttribute("stroke-width")) * window.panel._editor.scale);
t.check(hitW >= 21.9, `am Finger Trefferbreite ${hitW.toFixed(1)} px`);
await D(() => {
  const e = window.panel._editor;
  e.coarse = false;
  e.render();
});

// ---------------------------------------------------------------- D Editor-3D: Glastür, Pfeile, Live-Vorschau
await ed.locator('haus3d-panel .ed-bar [data-view="split"]').click();
await ed.waitForFunction(() => !!window.panel._editor.scene3d && window.panel._editor._3dShown, null, { timeout: 30000 });
await ed.waitForTimeout(1500);
const frame3d = async () => {
  await D(() => {
    const e = window.panel._editor;
    e.sel = null;
    e.render();
    e.renderProps();
    e._sync3d(true);
    const sc = e.scene3d;
    const [x, z] = [window.__np.x, window.__np.z];
    sc.controls.target.set(x, 0.62, z);
    sc.camera.position.set(x + 0.4, 0.9, z + 1.7);
    sc.controls.update();
    sc.invalidate?.();
  });
  await ed.waitForTimeout(1200);
};
await D(() => (window.__np = structuredClone(window.panel._editor.floor.furniture.find((m) => m.id === "n_cab"))));
await frame3d();
/** Punkt vorn auf einem Gerät im Schrank, erst wenn er sich nicht mehr ändert (die Größe der 3D-Ansicht setzt sich verzögert, dann verschiebt sich das Bild). */
const settled = async (id) => {
  let prev = null;
  for (let i = 0; i < 20; i++) {
    const at = await where(ed, id, { editor: true, front: true });
    if (prev && Math.hypot(at[0] - prev[0], at[1] - prev[1]) < 0.5) return at;
    prev = at;
    await ed.waitForTimeout(400);
  }
  return prev;
};
let srvAt = await settled("n_srv");
const pickSrv = await D(([x, y]) => window.panel._editor._pick3d(x, y), srvAt);
t.check(pickSrv?.furniture === "n_srv", `Server hinter der Glastür unter dem Zeiger: ${JSON.stringify(pickSrv)}`);
const upsAt = await settled("n_ups");
t.check((await D(([x, y]) => window.panel._editor._pick3d(x, y), upsAt))?.furniture === "n_ups", "USV hinter der Glastür unter dem Zeiger");
const plinth = await where(ed, "n_cab", { editor: true, y: 0.07, dz: 0.3 });
const pickCab = await D(([x, y]) => window.panel._editor._pick3d(x, y), plinth);
t.check(pickCab?.furniture === "n_cab", `Sockel: der Schrank selbst: ${JSON.stringify(pickCab)}`);
await t.shot(ed, "np-schrank-3d.png");
// echter Klick auf das Gerät: es wird gewählt, ohne Änderung
const u2 = await undoLen();
srvAt = await settled("n_srv");
await ed.mouse.click(srvAt[0], srvAt[1]);
await ed.waitForTimeout(250);
const afterClick = await D(() => ({ sel: window.panel._editor.sel, arrows: { vis: window.panel._editor._arrows?.group.visible, axes: window.panel._editor._arrows?.axes } }));
t.check(afterClick.sel?.id === "n_srv" && (await undoLen()) === u2, `Klick auf das Gerät wählt es ohne Schritt: ${JSON.stringify(afterClick.sel)}`);
t.check(afterClick.arrows.vis === false && afterClick.arrows.axes === "", `eingebautes Gerät: keine Pfeile: ${JSON.stringify(afterClick.arrows)}`);
// Ziehen an dem Gerät hinter der Glastür nimmt den Schrank samt Geräten mit; das Gerät wird nicht ausgebaut (dafür der Knopf „Ausbauen“)
{
  const [cab0, srv0] = [await item("n_cab"), await item("n_srv")];
  srvAt = await settled("n_srv");
  await ed.mouse.move(srvAt[0], srvAt[1]);
  await ed.waitForTimeout(60);
  await ed.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await ed.mouse.move(srvAt[0] + 12 * i, srvAt[1]);
    await ed.waitForTimeout(40);
  }
  const mid = await D(() => ({ sel: window.panel._editor.sel, live: window.panel._editor._live3d?.sel?.id ?? null }));
  await ed.mouse.up();
  await ed.waitForTimeout(500);
  const [cab1, srv1, ups1] = [await item("n_cab"), await item("n_srv"), await item("n_ups")];
  t.results.zugAmGeraet = { mid, cab: [cab0.x, cab1.x], srv: [srv0.x, srv1.x, srv1.in_rack], schritte: (await undoLen()) - u2 };
  t.check(mid.sel?.id === "n_cab" && mid.live === "n_cab", `Zug am Gerät: der Schrank ist gewählt und wird gezogen: ${JSON.stringify(mid)}`);
  t.check(cab1.x - cab0.x > 0.15 && near(srv1.x, cab1.x, 1e-6) && near(ups1.x, cab1.x, 1e-6), `Zug am Gerät bewegt den Schrank samt Geräten: ${cab0.x} → ${cab1.x}, Server ${srv1.x}`);
  t.check(srv1.in_rack === "n_cab" && ups1.in_rack === "n_cab" && srv1.rack_u === srv0.rack_u && cab1.rack_used === cab0.rack_used, `Gerät bleibt eingebaut: ${JSON.stringify([srv1.in_rack, srv1.rack_u, ups1.in_rack])}`);
  t.check((await undoLen()) === u2 + 1, `ein Rückgängig-Schritt für den Zug: ${(await undoLen()) - u2}`);
  await D(() => window.panel._editor.undo());
  await ed.waitForTimeout(500);
  t.check(near((await item("n_cab")).x, cab0.x, 1e-6) && (await item("n_srv")).in_rack === "n_cab", "Rückgängig stellt Schrank und Geräte wieder her");
}
await select("furniture", "n_cab");
await ed.waitForTimeout(250);
const cabArrows = await D(() => ({ vis: window.panel._editor._arrows?.group.visible, axes: window.panel._editor._arrows?.axes }));
t.check(cabArrows.vis === true && cabArrows.axes === "xyz", `Schrank: drei Pfeile: ${JSON.stringify(cabArrows)}`);

// --- Live-Vorschau beim Ziehen über den Boden: Geräte ziehen mit, das Rohr der Leitung ist weg, danach alles neu
await select("furniture", "n_cab");
await ed.waitForTimeout(200);
const poses = () => D(() => {
  const sc = window.panel._editor.scene3d;
  const out = {};
  sc.root.traverse((o) => {
    const id = o.userData.furniture;
    if (id?.startsWith("n_") && o.parent?.userData.furniture !== id && id !== "n_pipe") out[id] = [o.position.x, o.position.y, o.position.z];
  });
  const pipe = sc._pipes?.get("n_pipe");
  return { out, pipe: pipe ? { vis: pipe.tube.visible, stamp: pipe.tube.id } : null, live: !!window.panel._editor._live3d };
});
const p0 = await poses();
t.check(p0.pipe?.vis === true, `Rohr der Leitung steht in der Szene: ${JSON.stringify(p0.pipe)}`);
const grab = await where(ed, "n_cab", { editor: true, y: 0.07, dz: 0.3 });
await ed.mouse.move(grab[0], grab[1]);
await ed.waitForTimeout(80);
await ed.mouse.down();
let mid = null;
for (let i = 1; i <= 8; i++) {
  await ed.mouse.move(grab[0] + 12 * i, grab[1]);
  await ed.waitForTimeout(40);
}
mid = await poses();
t.results.mitteImZug = mid;
const dCab = mid.out.n_cab[0] - p0.out.n_cab[0];
t.check(mid.live && dCab > 0.15, `Schrank bewegt sich im Zug: ${dCab}`);
t.check(["n_srv", "n_ups"].every((id) => near(mid.out[id][0] - p0.out[id][0], dCab, 1e-6) && near(mid.out[id][2] - p0.out[id][2], mid.out.n_cab[2] - p0.out.n_cab[2], 1e-6)), `Geräte im Schrank ziehen live mit: ${JSON.stringify([mid.out, p0.out])}`);
t.check(mid.pipe?.vis === false, `Rohr der angeschlossenen Leitung im Zug ausgeblendet: ${JSON.stringify(mid.pipe)}`);
await ed.mouse.up();
await ed.waitForTimeout(900);
const end = await poses();
const cabD = await item("n_cab");
const srvD = await item("n_srv");
t.check(end.pipe?.vis === true && end.pipe.stamp !== p0.pipe.stamp, `nach dem Loslassen neues Rohr: ${JSON.stringify(end.pipe)}`);
t.check(near(end.out.n_srv[0], srvD.x, 1e-6) && near(srvD.x, cabD.x, 1e-6) && cabD.x > 9.6, `Daten und Szene stimmen: Schrank ${cabD.x}, Server ${srvD.x}, Szene ${end.out.n_srv[0]}`);
const pipeEnd = await D(() => window.panel._editor.floor.pipes.find((p) => p.id === "n_pipe").points[0]);
t.check(near(pipeEnd[0], cabD.x, 0.01), `Leitungsende zog mit: ${JSON.stringify(pipeEnd)}`);

// Pfeil „X“ am Schrank ziehen (Live-Vorschau mit Pfeil): Geräte folgen ebenfalls
await frame3d();
await select("furniture", "n_cab");
await ed.waitForTimeout(250);
const a0 = await poses();
const ax = await D(() => ({ p: window.panel._editor._arrows.screenPoint("x", 0.6), p0: window.panel._editor._arrows.screenPoint("x", 0), p1: window.panel._editor._arrows.screenPoint("x", 1) }));
if (ax.p) {
  const l = Math.hypot(ax.p1[0] - ax.p0[0], ax.p1[1] - ax.p0[1]) || 1;
  const dir = [(ax.p1[0] - ax.p0[0]) / l, (ax.p1[1] - ax.p0[1]) / l];
  await ed.mouse.move(ax.p[0], ax.p[1]);
  await ed.waitForTimeout(60);
  await ed.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await ed.mouse.move(ax.p[0] + dir[0] * 10 * i, ax.p[1] + dir[1] * 10 * i);
    await ed.waitForTimeout(40);
  }
  const m2 = await poses();
  const dx = m2.out.n_cab[0] - a0.out.n_cab[0];
  t.check(Math.abs(dx) > 0.1 && near(m2.out.n_ups[0] - a0.out.n_ups[0], dx, 1e-6) && m2.pipe?.vis === false, `Pfeil X: Geräte folgen live, Rohr weg: ${JSON.stringify([dx, m2.pipe])}`);
  await ed.mouse.up();
  await ed.waitForTimeout(800);
  const e2 = await poses();
  t.check(e2.pipe?.vis === true, "nach dem Pfeil-Zug wieder ein Rohr");
} else t.check(false, "Pfeil X nicht sichtbar");

await t.done();
