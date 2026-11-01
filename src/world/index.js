import * as THREE from "three";
import { makePath } from "./path.js";
import { planPlaces, VIEWS } from "./places.js";
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
import * as waterfall from "./spectacles/waterfall.js";
import * as pine from "./spectacles/pine.js";
import * as temple from "./spectacles/temple.js";
import * as pagoda from "./spectacles/pagoda.js";
import * as geese from "./spectacles/geese.js";

// The world is built from these modules, in order. Each exports
//   build({ scene, P, places, rng }) → optionally { update(time, camera) }
// To add something new: write a module like these, then add it to this list
// (and give it a spot in places.js).
const MODULES = [
  // landscape
  terrain, mountains, flora,
  // built things along the path: bridge, lanterns, pavilion, stele
  structures,
  // the garden stroll
  pond, plants, creatures, landmarks,
  // far-off spectacles
  waterfall, pine, temple, pagoda, geese,
  // distant ranges, sun, birds
  sky,
];

export function buildWorld(scene) {
  const P = makePath();
  const places = planPlaces(P); // first, so scattered trees / grass keep out of reserved spots
  const ctx = { scene, P, places, rng };

  const updaters = [];
  for (const m of MODULES) {
    const built = m.build(ctx);
    if (built?.update) updaters.push(built.update);
  }

  // named views, attached to their places (anchor = where a module put the name; else the place)
  const views = VIEWS.map((v) => {
    if (!places[v.of]) console.warn(`places.js: view "${v.zh}" refers to unknown place "${v.of}"`);
    return { ...v, place: places[v.of], pos: new THREE.Vector3() };
  });
  const placeViews = () => {
    for (const v of views) {
      if (!v.place) continue;
      v.pos.copy(v.place.anchor ?? v.place.pos);
      v.pos.y += v.height ?? 0;
    }
  };
  placeViews();

  return {
    ...P,
    views,
    update(time, camera) {
      for (const update of updaters) update(time, camera);
      placeViews(); // some views move (the boat, the geese)
    },
  };
}
