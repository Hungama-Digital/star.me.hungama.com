// src/starme/theme/colors.ts
// Exact values from android/.../ui/theme/Color.kt (StarPalette).
// Dark only, by spec. Do not add a light theme.
export const StarPalette = {
  bg: '#09090C',
  surface: '#16161D',
  surface2: '#22222D',
  line: '#343443',

  orange: '#D91E36', // the single action colour
  orangeDeep: '#8E0F22', // primary button gradient end
  gold: '#D4AF37',
  good: '#2A9D8F', // pass / success

  text: '#FFF7F2',
  dim: '#9C93AB',

  love1: '#3C0B2B',
  love2: '#D51E62',
  act1: '#071C2A',
  act2: '#087F93',

  goldInk: '#F2CD82', // signature ink, gold button start
  consentInk: '#CFC7DC', // consent body copy
  danger: '#E5484D',
  warn: '#E5A24D', // verify guidance text
} as const;

// App background: radial gradient from #1A0B12 (centre) to bg, radius ~1500.
// In RN use expo-linear-gradient as a vertical approximation:
export const AppBackdrop = {
  colors: ['#1A0B12', StarPalette.bg] as const,
  locations: [0, 1] as const,
};

export type StarColorKey = keyof typeof StarPalette;
