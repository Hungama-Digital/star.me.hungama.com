// useBannerGradient.ts
import { useState, useEffect } from "react";
import ImageColors from "react-native-image-colors";

// Type definition for gradient colors
type Gradient = { top: string; bottom: string };

// Helper function to clamp numbers within a range
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Helper function to convert hex color to RGB
function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// Helper function to convert RGB back to hex
function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => x.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Function to adjust color by desaturating and darkening if too bright
function makeSafeColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);

  // Calculate luminance
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Desaturate color a bit by mixing it with gray
  const gray = (r + g + b) / 3;
  const mix = 0.18; // 18% toward gray
  let rr = r + (gray - r) * mix;
  let gg = g + (gray - g) * mix;
  let bb = b + (gray - b) * mix;

  // Darken if the color is too bright
  if (lum > 180) {
    const factor = 0.78; // darken by ~22%
    rr *= factor; gg *= factor; bb *= factor;
  }

  return rgbToHex(
    clamp(Math.round(rr), 0, 255),
    clamp(Math.round(gg), 0, 255),
    clamp(Math.round(bb), 0, 255)
  );
}



export { makeSafeColor };
