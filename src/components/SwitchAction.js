import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const TOOLTIP_KEY = 'interactive_show_switch_tooltip_seen';

// SwitchAction — right-rail button shown after first branch choice.
// Tooltip appears once per device and auto-dismisses in 5 s.
// ASSUMPTION: Switch icon uses 'source-branch' (MaterialCommunityIcons) as placeholder.
//             Swap for design-confirmed SVG when design finalises.
const SwitchAction = ({ onPress }) => {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(TOOLTIP_KEY).then((val) => {
      if (!val) {
        setTooltipVisible(true);
        Animated.timing(tooltipOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        dismissTimer.current = setTimeout(() => dismissTooltip(), 5000);
        AsyncStorage.setItem(TOOLTIP_KEY, '1').catch(() => {});
      }
    }).catch(() => {});

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const dismissTooltip = () => {
    Animated.timing(tooltipOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setTooltipVisible(false);
    });
  };

  const handlePress = () => {
    if (tooltipVisible) dismissTooltip();
    onPress?.();
  };

  return (
    <View style={styles.wrapper}>
      {tooltipVisible && (
        <Animated.View style={[styles.tooltip, { opacity: tooltipOpacity }]}>
          <Text style={styles.tooltipText}>Want a different story? Tap here.</Text>
          <View style={styles.tooltipArrow} />
        </Animated.View>
      )}
      <TouchableOpacity style={styles.actionButton} onPress={handlePress} activeOpacity={0.8}>
        <View style={styles.iconContainer}>
          <Ionicons name="swap-horizontal" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.actionText}>Switch</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    position: 'relative',
  },
  actionButton: {
    alignItems: 'center',
    minWidth: 40,
    minHeight: 57,
    justifyContent: 'center',
  },
  iconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 50,
    padding: 11,
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
    fontFamily: 'Arial',
  },
  tooltip: {
    position: 'absolute',
    right: 62,
    top: 4,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 160,
    zIndex: 10,
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Arial',
    textAlign: 'center',
  },
  tooltipArrow: {
    position: 'absolute',
    right: -6,
    top: 14,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 6,
    borderStyle: 'solid',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(0,0,0,0.82)',
  },
});

export default SwitchAction;
