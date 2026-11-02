import * as THREE from "three";
import { makePath } from "./path.js";
import { planPlaces, MARKERS } from "./places.js";
import { rng } from "./random.js";

import * as terrain from "./landscape/terrain.js";
import * as mountains from "./landscape/mountains.js";
import * as flora from "./landscape/flora.js";
import * as sky from "./landscape/sky.js";
import * as structures from "./structures/structures.js";
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
  // built things along the path: tablets, lanterns, bridge, pavilion
  structures,
  // the garden stroll, and the small lives in it
  pond, plants, creatures, landmarks, critters,
  // spectacles: the waterfall pool, the canyon at the end (vista before temple: it
  // raises the temple's pillar), the lone pine, the pagoda, the geese
  waterfall, vista, temple, pine, pagoda, geese,
  // distant ranges, the red sun, birds; and petals drifting down around you
  sky, petals,
];

export function buildWorld(scene) {
  const P = makePath();
  const places = planPlaces(P); // first, so scattered trees / grass keep out of reserved spots
  const ctx = { scene, P, places, rng };

  const updaters = [];
  const built = []; // what each module returned (handy in the console with ?debug)
  for (const m of MODULES) {
    const b = m.build(ctx);
    built.push(b);
    if (b?.update) updaters.push(b.update);
  }

  // markers for your points, floating beside the places that stand for them
  const markers = MARKERS.filter((m) => {
    if (!places[m.of]) console.warn(`places.js: marker "${m.id}" refers to unknown place "${m.of}"`);
    return places[m.of];
  }).map((m) => ({
    ...m,
    pos: places[m.of].pos.clone().add(new THREE.Vector3(0, m.height ?? 0, 0)),
  }));

  return {
    ...P,
    markers,
    clickables: places.clickables ?? [], // things in the world you can click (the GitHub / LinkedIn / Email rocks)
    bench: places.bench?.pos,            // where you sit at the end
    built,
    update(time, camera) {
      for (const update of updaters) update(time, camera);
    },
  };
}
