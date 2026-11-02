import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { massifGeometry, mountainMaterial, mountainBushes } from "../landscape/mountains.js";
import { facing } from "./common.js";
import { createMist } from "../effects/mist.js";

/**
 * A mountain with falls pouring down the cleft between two of its peaks. W: { pos, r, h (the
 * taller peak's height), lip (the falls' lip, as a share of h), faces (the point it faces) }.
 * The two peaks stand either side of a ravine cut into the face toward `faces`, their ridges
 * running out toward you so the ravine between them is deep; a lower summit stands back behind
 * them, the saddle the water comes over. The falls drop down the ravine, widening as they fall:
 * a broad fall and a thin strand beside it (`strands: 1`: just the one).
 *   twin: the two peaks' heights (shares of h)   widths: the broad fall's [width at its lip, added by its foot]
 * Returns { peak (its geometry), pointAt(y) (on the falls' line, just in front of the ravine
 * floor), dir, side }.
 */
export function fallsMountain(scene, P, rand, W, { twin = [1, 0.84], strands = 2, widths = [2.6, 2.8], scrubFrom = null, material = {}, fallsMist = null } = {}) {
  const { dir, side } = facing(W);
  const ga = Math.atan2(dir.z, dir.x); // (massifGeometry's angles)
  const back = 0.7; // the summit behind, as a share of h
  const peak = P.keepOnLand(massifGeometry(rand, W.pos.x, W.pos.z, W.r, W.h * back, {
    lobes: 3, summit: 1.55, flare: 1.8, peaks: 7, rocky: 1.1, terraces: 0.15, crown: 1,
    mainAt: { angle: ga + Math.PI, dist: 0.16 }, mainR: 0.5, mainE: 1.4, mainRot: ga + Math.PI / 2,
    gully: { x: dir.x, z: dir.z, depth: 0.4, width: 0.32 },
    shoulders: [ // (either side of the ravine, clear of it: it runs down between them)
      // (beside it, not out in front of it: the falls pour from the face of the summit behind
      // into an open recess between them, seen from a wide sweep of the walk, not only head on)
      { angle: ga + 1.45, dist: 0.44, r: 0.42, h: twin[0] / back, e: 1.15, rot: ga + 1.3, s: 1.7, f: 1.75 },
      { angle: ga - 1.5, dist: 0.46, r: 0.4, h: twin[1] / back, e: 1.15, rot: ga - 1.3, s: 1.7, f: 1.75 },
      // and lower spurs stepping down off their outer flanks, one behind another
      { angle: ga + 1.95, dist: 0.68, r: 0.22, h: 0.42 * twin[0] / back, e: 1.6, rot: ga + 1.6 },
      { angle: ga - 2.0, dist: 0.7, r: 0.2, h: 0.36 * twin[1] / back, e: 1.6, rot: ga - 1.6 },
    ],
  }), 2); // (its back may reach round toward the end of the walk: kept on land, short of the cliff edge)
  // (a belt of cloud drifting across the peaks, below their tops: the falls come out of it)
  scene.add(new THREE.Mesh(peak, mountainMaterial({ cloud: new THREE.Vector4(W.h * 0.62, 5, 0.85, 0.8), cun: 1, layers: true, ...material })));
  // scrub on its slopes, but none down the ravine the water falls through, nor on the summit
  // behind it, seen through the notch the falls come over
  const off = (p) => Math.abs(Math.atan2(dir.x * (p.z - W.pos.z) - dir.z * (p.x - W.pos.x), dir.x * (p.x - W.pos.x) + dir.z * (p.z - W.pos.z)));
  const aside = (p) => Math.abs(dir.x * (p.z - W.pos.z) - dir.z * (p.x - W.pos.x)); // (metres off the falls' line)
  const from = scrubFrom ?? W.faces;
  scene.add(mountainBushes([peak], { seed: 86 + Math.floor(rand() * 100), density: 0.045, distTo: (p) => p.distanceTo(from), skip: (p) => off(p) < 0.62 || aside(p) < W.r * 0.2 }));

  // the falls: ribbons inside the ravine, widening as they fall: a broad one, and a thin strand
  // beside it that spills from lower down. The strand keeps a gap from the broad one all the
  // way down and hangs a little further back in the ravine, so the two never cross or overlap.
  const pointAt = (y) => {
    const out = peak.userData.radiusAt(dir.x, dir.z, y) + 0.35; // just in front of the ravine floor
    return new THREE.Vector3(W.pos.x + dir.x * out, y, W.pos.z + dir.z * out);
  };
  /** top: height of its lip; centre(v), width(v): across the falls (m), v from the lip (0) to the foot (1) */
  const ribbon = (top, centre, width, inset = 0) => {
    const N = 48;
    const positions = [];
    const uvs = [];
    const index = [];
    for (let j = 0; j <= N; j++) {
      const v = j / N; // 0 lip → 1 foot
      const y = top * (1 - v) - 0.5;
      const c = pointAt(y).addScaledVector(dir, -inset).addScaledVector(side, centre(v, y));
      const w = width(v);
      positions.push(c.x - side.x * w / 2, y, c.z - side.z * w / 2, c.x + side.x * w / 2, y, c.z + side.z * w / 2);
      uvs.push(0, v, 1, v);
      if (j < N) {
        const b = j * 2;
        index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  const fallsInk = inkMaterial({
    variant: "waterfall", tint: "water", channel: "far", climb: 0.002, noiseScale: 0.05, noiseAmp: 0.2,
    near: 40, far: 320, minFar: 0.4, density: 0.9, mist: 0.01, grain: 0.3, sil: 0,
    rim: 0.3, side: THREE.DoubleSide,
    ...(fallsMist ? { mist: fallsMist[1], mistBase: fallsMist[0], mistFloor: 0 } : {}), // (a far one: its foot lost in the mist)
  });
  const lip = W.h * (W.lip ?? 0.72);
  const broad = (v) => widths[0] + v * widths[1];         // the broad fall's width
  const halfAt = (y) => broad(1 - (y + 0.5) / lip) / 2;    // ...its half-width at height y
  const thin = (v) => 0.6 + v * 0.9;
  scene.add(new THREE.Mesh(ribbon(lip, () => 0, broad), fallsInk));
  if (strands > 1) scene.add(new THREE.Mesh(ribbon(lip * 0.82, (v, y) => halfAt(y) + 0.45 + thin(v) / 2, thin, 0.35), fallsInk));
  return { peak, pointAt, dir, side };
}

// 飞瀑 — the waterfall: it pours down the cleft between two peaks into a pool at your feet as
// you come out of the bamboo. The pool's stream runs under the bridge; cranes wade in its
// shallows and the fisherman drifts on it (garden/creatures.js). And far off on the left of
// the view from the bench, a second: a thread of white down another cleft, where the river
// comes winding from (places.farFalls).
export function build({ scene, P, places, rng }) {
  const rand = rng(85);
  const W = places.waterfall;
  const pool = places.pool;
  const { pointAt, dir, side } = fallsMountain(scene, P, rand, W, { scrubFrom: pool.pos });

  // the far falls: one strand, a little wider for the distance; the mountain's foot in the mist
  const F = places.farFalls;
  if (F) {
    fallsMountain(scene, P, rng(185), F, {
      twin: [1, 0.86], strands: 1, widths: [3.2, 3.6], fallsMist: [2, 20],
      material: { cloud: new THREE.Vector4(F.h * 0.45, 5, 0.75, 0.6), mist: 26 },
    });
  }

  // the pool it falls into
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(pool.r, 64).rotateX(-Math.PI / 2),
    inkMaterial({
      variant: "pond", tint: "water", channel: "mid", bias: 0.05, climb: 0, noiseScale: 0.15, noiseAmp: 0.3,
      near: 3, far: 60, minFar: 0, density: 0.6, mist: 0.01, sil: 0,
      color: new THREE.Color("#22303d"), flow: new THREE.Vector4(pool.r, 0, pool.pos.x, pool.pos.z),
    })
  );
  water.position.set(pool.pos.x, 0.03, pool.pos.z);
  scene.add(water);

  // stones around its edge (leaving a gap where the stream flows out)
  const stoneMat = inkMaterial({
    channel: "mid", bias: 0.05, climb: 0.05, noiseScale: 0.7, near: 3, far: 50,
    density: 0.85, mist: 0.01, grain: 2, shade: 0.2,
  });
  const outflow = Math.atan2(places.river.flow.z, places.river.flow.x);
  const stones = [];
  for (let a = 0; a < Math.PI * 2; a += rand.range(0.18, 0.34)) {
    const d = Math.atan2(Math.sin(a - outflow), Math.cos(a - outflow));
    if (Math.abs(d) < 0.45) continue; // the stream's mouth
    stones.push(a);
  }
  const edge = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), stoneMat, stones.length);
  const dummy = new THREE.Object3D();
  stones.forEach((a, i) => {
    const s = rand.range(0.4, 1.0);
    dummy.position.set(pool.pos.x + Math.cos(a) * (pool.r + 0.2), 0.05, pool.pos.z + Math.sin(a) * (pool.r + 0.2));
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * 1.3, s * 0.5, s);
    dummy.updateMatrix();
    edge.setMatrixAt(i, dummy.matrix);
  });
  edge.frustumCulled = false;
  scene.add(edge);

  // spray: steam billowing up where it lands, a finer spray climbing the foot of the falls,
  // and a thin veil drifting over the pool
  const foot = pointAt(0);
  createMist(scene, rand, {
    count: 34, size: [2.2, 4.4], life: 5.5, rise: 0.7, grow: 1.2, drift: 1.4, opacity: 0.9, shadeAmount: 0.42,
    spots: (i, r) => [foot.x + side.x * r.range(-3.2, 3.2) + dir.x * r.range(-0.5, 2), r.range(0.2, 1.4),
                      foot.z + side.z * r.range(-3.2, 3.2) + dir.z * r.range(-0.5, 2)],
  });
  createMist(scene, rand, {
    count: 12, size: [1.4, 2.6], life: 7, rise: 0.9, grow: 1.4, drift: 0.8, opacity: 0.6, shadeAmount: 0.3,
    spots: (i, r) => {
      const y = r.range(1.5, 5);
      const c = pointAt(y).addScaledVector(dir, 0.6).addScaledVector(side, r.range(-2.2, 2.2));
      return [c.x, y, c.z];
    },
  });
  createMist(scene, rand, {
    count: 12, size: [3, 6], life: 14, rise: 0.08, grow: 0.6, drift: 3, opacity: 0.42, shadeAmount: 0.22,
    spots: (i, r) => {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * pool.r;
      return [pool.pos.x + Math.cos(a) * d, r.range(0.4, 1.4), pool.pos.z + Math.sin(a) * d];
    },
  });
}
