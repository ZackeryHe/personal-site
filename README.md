# personal-site

An ink-wash landscape you walk through. Ink spreads out from where you stand and
paints the world in as you go. See `CONCEPT.md` for the idea behind it.

## Run it

```sh
npm install      # first time only
npm run dev      # → http://localhost:5173
npm run build    # static site in dist/, ready for any host once there's a domain
```

Dev URL options (combine with `&`):

| URL | What it does |
|---|---|
| `?t=0.5` | start halfway along the path (0 = start, 1 = end) |
| `?instant` | skip the opening drop; ink has already spread around you |
| `?look=-0.6` | start with your head turned (negative = left), until you move the mouse |
| `?warp=4` | run time 4× faster (testing blooms and other slow things) |
| `?debug` | exposes `window.site` (walker, colour, drops, world, scene…) in the console; `site.world.built` holds each world module's state |

e.g. the koi pond: `?t=0.135&instant&look=-0.75`

Controls: scroll / swipe / ↑↓ to walk, move the mouse to look, click the ground to flick ink,
click the dots on the right to jump to a section. Stand still and you can turn your head much
further; crane to the side and colour blooms where you look (see "The colour stage" below).
Walk all the way to the end and you sit down on the stone bench and turn round to look back the
way you came (`walk.sitTurn`); move the mouse to the edge of the screen to face the canyon again.

## Where to edit what

| To change… | Edit |
|---|---|
| **What it says**: your name, your points (Contacts: GitHub, LinkedIn, Email; Experience, Projects, Resume): labels, links, panel text (HTML ok) | `src/content.js` |
| **Where things are**: the path's shape (`world/path.js`), each point's stop + marker, garden spots, spectacles, the sun | `src/world/places.js` |
| **How it feels**: ink speed/reach, sketch distance, scroll speed, intro timing, the colour stage | `src/config.js` |
| Colours, fonts, overlay layout | `src/style.css`, top of `src/ink/material.js` |

## How the code is laid out

```
src/
  main.js            wires everything together + the frame loop
  content.js         your words
  config.js          the main settings
  app/
    walker.js        you: input, moving along the path, camera, standing still + craning,
                     a gentle nudge toward your points as you approach them
    drops.js         the ink: opening drop, footsteps, thrown-ahead ink, click-to-flick
    colour.js        the colour stage: blooms where you crane (and a little where you click),
                     flowers, butterflies
    brush.js         the pointer: an ink-painted brush (loads with colour, spatters on click)
    picker.js        clickable things in the world (the GitHub / LinkedIn / Email rocks)
    ui.js            panels + markers that bleed in like ink, progress dots, the hint
  ink/               the rendering "engine"
    field.js         top-down map of how far ink has spread (from the drops)
    material.js      every object's ink look: spreading edge, washes, sketch, variants
    post.js          full-screen watercolour pass (edges, pooling, outlines, paper)
    noise.js         shared GLSL noise
  world/
    index.js         builds the world from a list of modules (add new ones here)
    places.js        where everything is: stops, markers for your points, scenery
    path.js          the walk's curve + helpers (at(t, side), heightAt, the cliff, keepOnLand, reserve/blocked)
    landscape/       terrain (ground ending at the cliff, stones, grass, the stream), mountains,
                     trees, bushes (dabs of scrub scattered over any mountain), sky (distant
                     ranges, the red sun and its glow, birds)
    structures/      the avenue of tablets (Experience), lanterns in the bamboo (Projects),
                     the bridge, the pavilion (Resume)
    garden/          koi pond, plants (bamboo, plum, flowers), creatures (cranes, deer,
                     butterflies, the boat), critters (birds + rabbits that react to you),
                     landmarks (your name rock, the GitHub / LinkedIn / Email rocks, scholar's rocks)
    spectacles/      the waterfall + its pool, the canyon at the end (vista: towers in layers
                     dotted with scrub, the sea of cloud, the stone arch, a waterfall, cranes
                     crossing the sun),
                     the temple on a mesa, the lone pine on the brink, pagoda, geese
    effects/         mist (soft drifting puffs, on the GPU), petals drifting down around you
```

Every world module exports `build({ scene, P, places, rng })` and may return
`{ update(time, camera) }`. To add something: copy a small module (e.g.
`spectacles/pagoda.js`), give it a spot in `places.js`, and add it to the list in
`world/index.js`.

To add a point (say "Writing"): add it to `points` in `content.js` (label, text, link),
give it a stop in `STOPS` and a `MARKERS` entry in `places.js` pointing at the place that
stands for it.

## How the ink works

1. **Drops** (`app/drops.js`): one lands at your feet every few metres, more are thrown
   ahead when you hurry, and you can click to flick one. Each grows outward over time;
   the opening drop blooms slowly, the rest quickly.
2. **Ink field** (`ink/field.js`): every frame the drops are rendered into a top-down
   texture saying how far inside the spreading ink each spot is, at three scales: trees
   and buildings, mountains, and the wash on the ground (plus how wet it still is).
3. **Ink material** (`ink/material.js`): objects sample the field. Not reached yet, they're
   invisible, or line-drawn if within the sketch radius (白描). At the front: a blotchy
   edge with a dark rim, climbing upward from the ground. Behind it: ink density, washes,
   mist, moss dots.
4. **Watercolour pass** (`ink/post.js`): the whole frame is repainted: wobbly edges,
   pigment pooling, broken brush outlines, sketch lines, granulation, paper texture.

## The colour stage (设色)

Stand still (`walk.stillAfter`) and turn your head to the side (`colour.crane`), and colour
starts coming in, faint at first, where your gaze meets the ground; it fills in over
`colour.fill` seconds while you keep looking (`app/colour.js`). Colour drops live in a second
ink field; every material samples it and shifts toward its tint (`TINTS` in
`ink/material.js`: foliage, wood, rock, ground, water, mountain = 青绿 blue-green, blossom;
pick one with a material's `tint` option). Flowers spring up from the middle outward,
butterflies come, and the brush pointer's tip loads with the colour. The colour stays.

As you approach one of your points, your head is nudged toward it: each marker's `nudge`
in `places.js` (how far), `walk.nudgeEase` in `config.js` (how gently).
