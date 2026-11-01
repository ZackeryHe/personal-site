/** Seeded random numbers, so the world is identical on every load. */
export function rng(seed) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  rand.range = (a, b) => a + rand() * (b - a);
  return rand;
}
