// src/starme/theme/shapes.ts
// Radii from Shape.kt and the screens (guide section 4).
export const radius = {
  cta: 18, // CTA button
  card: 20, // StarCard
  pill: 12, // pills, fields, small chips
  note: 14, // consent note box, signature box
  row: 16, // package row, benefit strip
  tile: 18, // benefit tile, role card, story poster
  hero: 24, // featured hero, project card
  pass: 26, // membership pass
  world: 22, // world poster (Concept)
  round: 999, // wallet chip, coin, badges
} as const;

// Spacing: screen gutter 20, top 10, bottom 24. Card padding 18.
// CTA dock padding 20 horizontal, 10 vertical.
export const spacing = {
  gutter: 20,
  top: 10,
  bottom: 24,
  cardPadding: 18,
  dockH: 20,
  dockV: 10,
} as const;

export type RadiusKey = keyof typeof radius;
