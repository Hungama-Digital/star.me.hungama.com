import React, { memo } from 'react';
import Svg, { Path, Mask, G, Defs, ClipPath, Rect } from 'react-native-svg';

/**
 * Success checkmark from design (Success Icon.svg).
 */
const SubscriptionCancelSuccessIcon = memo(({ width = 80, height = 80 }) => (
  <Svg width={width} height={height} viewBox="0 0 80 80" fill="none">
    <Defs>
      <Mask id="subCancelSuccessMask" maskUnits="userSpaceOnUse">
        <Path
          d="M0 40C0 17.9086 17.9086 0 40 0C62.0914 0 80 17.9086 80 40C80 62.0914 62.0914 80 40 80C17.9086 80 0 62.0914 0 40Z"
          fill="#FFFFFF"
        />
      </Mask>
      <ClipPath id="subCancelSuccessClip">
        <Rect x={21} y={21} width={38} height={38} fill="#FFFFFF" />
      </ClipPath>
    </Defs>
    <Path
      d="M0 40C0 17.9086 17.9086 0 40 0C62.0914 0 80 17.9086 80 40C80 62.0914 62.0914 80 40 80C17.9086 80 0 62.0914 0 40Z"
      fill="#34C759"
      fillOpacity={0.1}
    />
    <Path
      d="M0 40M80 40M80 40M0 40M40 0M80 40M40 80M0 40M40 80V78C19.0132 78 2 60.9868 2 40H0H-2C-2 63.196 16.804 82 40 82V80ZM80 40H78C78 60.9868 60.9868 78 40 78V80V82C63.196 82 82 63.196 82 40H80ZM40 0V2C60.9868 2 78 19.0132 78 40H80H82C82 16.804 63.196 -2 40 -2V0ZM40 0V-2C16.804 -2 -2 16.804 -2 40H0H2C2 19.0132 19.0132 2 40 2V0Z"
      fill="#34C759"
      fillOpacity={0.35}
      mask="url(#subCancelSuccessMask)"
    />
    <G clipPath="url(#subCancelSuccessClip)">
      <Path
        d="M40 57.5C49.665 57.5 57.5 49.665 57.5 40C57.5 30.335 49.665 22.5 40 22.5C30.335 22.5 22.5 30.335 22.5 40C22.5 49.665 30.335 57.5 40 57.5Z"
        stroke="#34C759"
        strokeWidth={2}
        fill="none"
      />
      <Path
        d="M32 40.5L37.5 46L48 34"
        stroke="#34C759"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </G>
  </Svg>
));

export default SubscriptionCancelSuccessIcon;
