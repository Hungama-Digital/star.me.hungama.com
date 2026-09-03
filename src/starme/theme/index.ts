// src/starme/theme/index.ts
// Single import surface + the font-registration map used by expo-font.
export { StarPalette, AppBackdrop } from './colors';
export type { StarColorKey } from './colors';
export { type, Display, Body } from './type';
export type { TypeKey } from './type';
export { radius, spacing } from './shapes';
export type { RadiusKey } from './shapes';

// Font family key -> bundled TTF. Registered once in App.js useFonts().
export const StarFonts = {
  'Anton-Regular': require('../assets/fonts/Anton-Regular.ttf'),
  'Inter-Variable': require('../assets/fonts/Inter-Variable.ttf'),
} as const;

// Bundled keyart, used by Promo, Concept, Projects.
export const StarImages = {
  loveKeyart: require('../assets/images/story_love_keyart.png'),
  actionKeyart: require('../assets/images/story_action_keyart.png'),
  // Vertical StarME brand lockup (white text, for dark surfaces). Star over wordmark.
  logo: require('../assets/images/starme_logo_vertical.png'),
} as const;
