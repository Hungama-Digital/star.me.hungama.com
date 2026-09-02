import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../context/SubscriptionContext';

const LockedEpisodeOverlay = ({ 
  episode, 
  onUnlockPress, 
  style,
  showCost = true 
}) => {
  const { isEpisodeUnlocked } = useSubscription();

  if (!episode || isEpisodeUnlocked(episode.id)) {
    return null;
  }

  return (
    <View style={[styles.overlay, style]}>
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0.9)']}
        style={styles.gradient}
      >
        {/* Lock Icon */}
        <View style={styles.lockContainer}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={24} color="#009CDB" />
          </View>
        </View>

        {/* Episode Info */}
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={2}>
            {episode.title}
          </Text>
        </View>

        {/* Lock Status Message */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Episode Locked
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 12,
  },
  lockContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeInfo: {
    alignItems: 'center',
    marginBottom: 8,
  },
  episodeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 16,
  },
  costContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  costText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 4,
  },

  balanceIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  balanceText: {
    fontSize: 10,
    color: '#FFD700',
    fontWeight: '600',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '600',
  },
});

export default LockedEpisodeOverlay; 