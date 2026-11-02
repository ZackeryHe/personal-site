/** Seeded random numbers, so the world is identical on every load. */
export function rng(seed) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  rand.range = (a, b) => a + rand() * (b - a);
  return rand;
}

/**
 * Smooth 3-D value noise from a seeded rand: n(x, y, z) → about -1…1, varying gently over
 * about one unit. For shapes that should be organic rather than jagged (weathered rock, cliffs).
 */
export function noise3(rand) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const values = Float32Array.from({ length: 256 }, () => rand() * 2 - 1);
  const at = (x, y, z) => values[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    return lerp(
      lerp(lerp(at(xi, yi, zi), at(xi + 1, yi, zi), u), lerp(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), u), lerp(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), u), v),
      w
    );
  };
}
