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

e.g. the koi pond: `?t=0.135&instant&look=-0.75`

Controls: scroll / swipe / ↑↓ to walk, move the mouse to look, click the ground to flick ink,
click the dots on the right to jump to a section.

## Where to edit what

| To change… | Edit |
|---|---|
| **What it says**: your name, section text (HTML ok), the hint | `src/content.js` |
| **Where things are**: section stops, garden spots, spectacles, view names | `src/world/places.js` |
| **How it feels**: ink speed/reach, sketch distance, scroll speed, intro timing | `src/config.js` |
| Colours, fonts, overlay layout | `src/style.css`, top of `src/ink/material.js` |

## How the code is laid out

```
src/
  main.js            wires everything together + the frame loop
  content.js         your words
  config.js          the main settings
  app/
    walker.js        you: input, moving along the path, camera, gaze drawn to views
    drops.js         the ink: opening drop, footsteps, thrown-ahead ink, click-to-flick
    ui.js            section text + view names that bleed in like ink, progress markers
  ink/               the rendering "engine"
    field.js         top-down map of how far ink has spread (from the drops)
    material.js      every object's ink look: spreading edge, washes, sketch, variants
    post.js          full-screen watercolour pass (edges, pooling, outlines, paper)
    noise.js         shared GLSL noise
  world/
    index.js         builds the world from a list of modules (add new ones here)
    places.js        where everything is + the named views
    path.js          the walk's curve + helpers (at(t, side), heightAt, reserve/blocked)
    landscape/       terrain (ground, stones, grass, river), mountains, pines, sky
    structures/      bridge, lanterns, pavilion, stele (+ the roof shape)
    garden/          the stroll: koi pond, plants (bamboo, plum, flowers),
                     creatures (cranes, deer, butterflies, boat), name rock + scholar's rocks
    spectacles/      seen from afar: waterfall, welcoming pine, temple, pagoda, geese
```

Every world module exports `build({ scene, P, places, rng })` and may return
`{ update(time, camera) }`. To add something: copy a small module (e.g.
`spectacles/pagoda.js`), give it a spot in `places.js` (and a name in `VIEWS` if it's a
view), and add it to the list in `world/index.js`.

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
