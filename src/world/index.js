import * as THREE from "three";
import { makePath, LAND } from "./path.js";
import { globals } from "../ink/material.js";
import { planPlaces, MARKERS } from "./places.js";
import { rng } from "./random.js";
import { SITE } from "../content.js";

import * as terrain from "./landscape/terrain.js";
import * as mountains from "./landscape/mountains.js";
import * as flora from "./landscape/flora.js";
import * as sky from "./landscape/sky.js";
import * as structures from "./structures/structures.js";
import * as well from "./structures/well.js";
import * as pond from "./garden/pond.js";
import * as plants from "./garden/plants.js";
import * as creatures from "./garden/creatures.js";
import * as landmarks from "./garden/landmarks.js";
import * as critters from "./garden/critters.js";
import * as waterfall from "./spectacles/waterfall.js";
import * as vista from "./spectacles/vista.js";
import * as pine from "./spectacles/pine.js";
import * as temple from "./spectacles/temple.js";
import * as pagoda from "./spectacles/pagoda.js";
import * as geese from "./spectacles/geese.js";
import * as petals from "./effects/petals.js";

// The world is built from these modules, in order. Each exports
//   build({ scene, P, places, rng }) → optionally { update(time, camera) }
// To add something new: write a module like these, then add it to this list
// (and give it a spot in places.js).
const MODULES = [
  // landscape (the ground ends at the cliff)
  terrain, mountains, flora,
  // built things along the path: tablets, lanterns, bridge, pavilion; the well
  structures, well,
  // the garden stroll, and the small lives in it
  pond, plants, creatures, landmarks, critters,
  // spectacles: the waterfall pool, the canyon at the end (vista before temple: it
  // raises the temple's pillar), the lone pine, the pagoda, the geese
  waterfall, vista, temple, pine, pagoda, geese,
  // distant ranges, the red sun, birds; and petals drifting down around you
  sky, petals,
];

/**
 * Build the world, a little at a time: it lets a frame through whenever it has worked for ~10 ms
 * (between modules, and inside the big ones: ctx.breathe()), so the greeting keeps moving and the
 * page keeps answering while it's built. onProgress(k): 0 → 1 as the modules are done.
 */
export async function buildWorld(scene, { onProgress = () => {} } = {}) {
  let since = performance.now();
  const breathe = async () => {
    if (performance.now() - since < 10) return;
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    since = performance.now();
  };

  const P = makePath();
  // the shaders know the lie of the land too (ink climbs things from the ground they stand on)
  globals.uLand.value.set(P.brink.x, P.brink.z, P.endDir.x, P.endDir.z);
  globals.uLandHeight.value = LAND.rim;
  const places = planPlaces(P); // first, so scattered trees / grass keep out of reserved spots
  const ctx = { scene, P, places, rng, breathe };

  const updaters = [];
  const built = []; // what each module returned (handy in the console with ?debug)
  for (const [i, m] of MODULES.entries()) {
    await breathe();
    const b = await m.build(ctx);
    built.push(b);
    if (b?.update) updaters.push(b.update);
    onProgress((i + 1) / MODULES.length);
  }

  // markers for your points, floating beside the places that stand for them
  const markers = MARKERS.filter((m) => {
    if (!places[m.of]) console.warn(`places.js: marker "${m.id}" refers to unknown place "${m.of}"`);
    return places[m.of];
  }).map((m) => ({
    ...m,
    pos: places[m.of].pos.clone().add(new THREE.Vector3(0, m.height ?? 0, 0)),
  }));
  // ...and a small name over each lit lantern, your projects (click one to read it)
  for (const l of places.lanterns ?? []) {
    const p = SITE.projects?.[l.project];
    if (!p) continue;
    markers.push({
      id: `project-${l.project}`, label: p.name, small: true, opens: `projects:${l.project}`, radius: 14,
      pos: l.pos.clone().add(new THREE.Vector3(0, 2.85, 0)),
    });
  }

  return {
    ...P,
    markers,
    clickables: places.clickables ?? [], // things in the world you can click (the GitHub / LinkedIn / Email rocks)
    bench: places.bench?.pos,            // where you sit at the end
    painting: places.painting,           // ...and the view you turn round to there
    benchClear: places.bench?.keepClear ?? 0, // ...and how far around it stays clear of flowers and petals
    built,
    update(time, camera) {
      for (const update of updaters) update(time, camera);
    },
  };
}
