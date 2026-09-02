import React, { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const defaultColors = {
  top: '#000000',
  center: '#000000',
  bottom: '#000000',
};

/**
 * Holds gradient color state locally so that when the hero carousel swipes
 * and updates colors via ref.current.setColors(), only this component re-renders,
 * not the whole Home screen (avoids tile flicker below swimlanes).
 * Updates happen immediately for fast response.
 */
const HeroBackgroundGradient = forwardRef(function HeroBackgroundGradient(_, ref) {
  const [colors, setColors] = useState(defaultColors);
  const setColorsRef = useRef(setColors);

  // Keep ref in sync for immediate access
  setColorsRef.current = setColors;

  // Convert hex color to rgba with specified opacity
  const hexToRgba = (hex, opacity = 1) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return hex; // Return original if not a valid hex
  };

  useImperativeHandle(ref, () => ({
    setColors(next) {
      // Apply 0.5 opacity to the top color (carousel-derived color)
      const topColor = next?.top ?? defaultColors.top;
      const topColorWithOpacity = hexToRgba(topColor, 0.5);
      
      const newColors = {
        top: topColorWithOpacity,
        center: next?.center ?? defaultColors.center,
        bottom: next?.bottom ?? defaultColors.bottom,
      };
      
      // Update immediately for fast response
      setColorsRef.current(newColors);
    },
  }), []);

  // Extract RGB values from hex or rgba color string
  const extractRgb = (color) => {
    // Handle rgba format: rgba(255, 255, 255, 0.5)
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1], 10),
        g: parseInt(rgbaMatch[2], 10),
        b: parseInt(rgbaMatch[3], 10),
      };
    }
    // Handle hex format: #ffffff
    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    if (hexMatch) {
      return {
        r: parseInt(hexMatch[1], 16),
        g: parseInt(hexMatch[2], 16),
        b: parseInt(hexMatch[3], 16),
      };
    }
    return { r: 0, g: 0, b: 0 };
  };

  // Extract opacity from rgba or default to 1
  const extractOpacity = (color) => {
    const rgbaMatch = color.match(/rgba\([^)]+,\s*([\d.]+)\)/);
    return rgbaMatch ? parseFloat(rgbaMatch[1]) : 1;
  };

  const topRgb = extractRgb(colors.top);
  const bottomRgb = extractRgb(colors.bottom);
  const topOpacity = extractOpacity(colors.top);
  const bottomOpacity = extractOpacity(colors.bottom);
  
  // Create intermediate color (70% top, 30% bottom) for smoother blend
  const midR = Math.round(topRgb.r * 0.7 + bottomRgb.r * 0.3);
  const midG = Math.round(topRgb.g * 0.7 + bottomRgb.g * 0.3);
  const midB = Math.round(topRgb.b * 0.7 + bottomRgb.b * 0.3);
  const midOpacity = topOpacity * 0.7 + bottomOpacity * 0.3;
  const midColor = `rgba(${midR}, ${midG}, ${midB}, ${midOpacity})`;

  return (
    <LinearGradient
      colors={[colors.top, midColor, colors.bottom]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
      locations={[0, 0.4, 1]}
    />
  );
});

export default HeroBackgroundGradient;
