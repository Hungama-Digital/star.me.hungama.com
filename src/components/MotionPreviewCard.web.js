/**
 * MotionPreviewCard.web.js — Web passthrough (no video).
 *
 * expo-video's VideoView uses requireNativeViewManager which is unavailable on web.
 * On web we simply render children (static thumbnail) with no preview overlay.
 * Metro automatically uses this .web.js file on web platform.
 */

import React from 'react';
import { View } from 'react-native';

const MotionPreviewCard = ({ children, style }) => (
    <View style={style}>{children}</View>
);

MotionPreviewCard.displayName = 'MotionPreviewCard';

export default MotionPreviewCard;
