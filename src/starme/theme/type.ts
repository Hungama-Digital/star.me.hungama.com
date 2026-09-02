// src/starme/theme/type.ts
// From Type.kt. Two families, no others.
// letterSpacing in Compose is em; RN wants points. points = em * fontSize.
import type { TextStyle } from 'react-native';

export const Display = 'Anton-Regular'; // condensed, heavy, used all caps
export const Body = 'Inter-Variable';

type NamedStyle = TextStyle;

export const type = {
  displayLarge: { fontFamily: Display, fontSize: 44, lineHeight: 43, letterSpacing: 0.88 },
  headlineMedium: { fontFamily: Display, fontSize: 26, lineHeight: 30, letterSpacing: 0.52 },
  headlineSmall: { fontFamily: Display, fontSize: 21, lineHeight: 26, letterSpacing: 0.42 },
  titleLarge: { fontFamily: Body, fontWeight: '600', fontSize: 18, lineHeight: 24 },
  titleMedium: { fontFamily: Body, fontWeight: '600', fontSize: 15, lineHeight: 20 },
  titleSmall: { fontFamily: Body, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  bodyLarge: { fontFamily: Body, fontWeight: '400', fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: Body, fontWeight: '400', fontSize: 14, lineHeight: 21 },
  bodySmall: { fontFamily: Body, fontWeight: '400', fontSize: 12, lineHeight: 18 },
  labelLarge: { fontFamily: Body, fontWeight: '700', fontSize: 15, lineHeight: 20 },
  labelMedium: { fontFamily: Body, fontWeight: '700', fontSize: 12, letterSpacing: 1.4 },
  labelSmall: { fontFamily: Body, fontWeight: '700', fontSize: 11, lineHeight: 16, letterSpacing: 2.64 },
} as const satisfies Record<string, NamedStyle>;

export type TypeKey = keyof typeof type;
