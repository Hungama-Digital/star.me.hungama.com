import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from './LazyImage';
import InteractiveChip from './InteractiveChip';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 64) / 2; // 2 cols: 12*2 margin + 16*2 padding + 8 gap
const CARD_H = CARD_W * 1.5;

function BadgePill({ branch }) {
  if (branch.badge_type === 'most_watched') {
    const label = `MOST WATCHED ${branch.badge_value || ''}`.trim();
    return (
      <View style={[styles.badgePill, { backgroundColor: 'rgba(0,0,0,0.72)' }]}>
        <Ionicons name="eye" size={11} color="#00D4FF" style={{ marginRight: 4 }} />
        <Text style={[styles.badgeText, { color: '#00D4FF' }]} numberOfLines={1}>{label}</Text>
      </View>
    );
  }
  if (branch.badge_type === 'recommended') {
    return (
      <View style={[styles.badgePill, { backgroundColor: 'rgba(160,110,0,0.88)' }]}>
        <Ionicons name="star" size={11} color="#FFD700" style={{ marginRight: 4 }} />
        <Text style={[styles.badgeText, { color: '#FFFFFF' }]} numberOfLines={1}>RECOMMENDED</Text>
      </View>
    );
  }
  if (branch.badge_type === 'people_watched') {
    const label = `${branch.badge_value || ''} PEOPLE WATCHED`.trim();
    return (
      <View style={[styles.badgePill, { backgroundColor: 'rgba(0,0,0,0.72)' }]}>
        <Text style={[styles.badgeText, { color: '#FFFFFF' }]} numberOfLines={1}>{label}</Text>
      </View>
    );
  }
  return null;
}

const ChoiceCard = React.memo(({ branch, isSelected, onSelect, showPreviouslyChosen, episodes }) => {
  const firstEp = episodes?.find(
    ep => ep.id === branch.to_asset_id || ep.asset_id === branch.to_asset_id,
  );
  const thumbUri = branch.thumbnail_url
    || firstEp?.poster
    || firstEp?.horizontalFilePath
    || firstEp?.verticalFilePath;
  const thumbSource = thumbUri ? { uri: thumbUri } : null;
  const borderColor = isSelected || showPreviouslyChosen ? '#FF6623' : 'transparent';

  return (
    <TouchableOpacity
      onPress={() => onSelect(branch.id)}
      activeOpacity={0.75}
      style={[styles.card, { width: CARD_W, height: CARD_H, borderColor }]}
    >
      {thumbSource ? (
        <LazyImage source={thumbSource} style={StyleSheet.absoluteFill} resizeMode="cover" priority={true} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cardPlaceholder]} />
      )}
      <BadgePill branch={branch} />
      <View style={styles.cardCaption}>
        <Text style={styles.captionText} numberOfLines={2}>{branch.display_label}</Text>
      </View>
    </TouchableOpacity>
  );
});
ChoiceCard.displayName = 'ChoiceCard';

// Card grid layout adapts to 2/3/4 branches
function CardGrid({ branches, selectedId, previouslyChosenId, onSelect, episodes }) {
  const sorted = [...branches].sort((a, b) => a.order_index - b.order_index);

  const makeCard = (branch) => (
    <ChoiceCard
      key={branch.id}
      branch={branch}
      isSelected={selectedId === branch.id}
      showPreviouslyChosen={previouslyChosenId === branch.id && !selectedId}
      onSelect={onSelect}
      episodes={episodes}
    />
  );

  if (sorted.length === 4) {
    return (
      <View>
        <View style={styles.cardRow}>{sorted.slice(0, 2).map(makeCard)}</View>
        <View style={[styles.cardRow, { marginTop: 8 }]}>{sorted.slice(2, 4).map(makeCard)}</View>
      </View>
    );
  }
  if (sorted.length === 3) {
    return (
      <View>
        <View style={styles.cardRow}>{sorted.slice(0, 2).map(makeCard)}</View>
        <View style={[styles.cardRow, { marginTop: 8 }]}>
          {makeCard(sorted[2])}
        </View>
      </View>
    );
  }
  return <View style={styles.cardRow}>{sorted.map(makeCard)}</View>;
}

const InteractiveChoiceModal = ({
  visible,
  choicePoint,
  previouslyChosenBranchId,
  onSelect,
  onDismiss,
  episodes,
  disableAutoSelect = false,
}) => {
  const countdownSecs = choicePoint?.countdown_seconds ?? 8;
  const [remaining, setRemaining] = useState(countdownSecs);
  const [selectedId, setSelectedId] = useState(null);
  const hasAutoSelected = useRef(false);

  useEffect(() => {
    if (!visible || !choicePoint) return;
    setRemaining(countdownSecs);
    setSelectedId(null);
    hasAutoSelected.current = false;

    if (disableAutoSelect) return;

    const tick = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(tick);
          if (!hasAutoSelected.current) {
            hasAutoSelected.current = true;
            onSelect(choicePoint.default_branch_id);
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [visible, choicePoint, disableAutoSelect]);

  const handleSelect = useCallback((branchId) => {
    if (selectedId) return; // already chosen
    hasAutoSelected.current = true;
    setSelectedId(branchId);
    setTimeout(() => onSelect(branchId), 300);
  }, [selectedId, onSelect]);

  if (!choicePoint) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity style={styles.contentArea} activeOpacity={1}>
          {/* Header */}
          <View style={styles.header}>
            <InteractiveChip size="medium" />
            <Text style={styles.promptText}>{choicePoint.prompt_text}</Text>
            <Text style={styles.subtitleText} numberOfLines={1}>{choicePoint.subtitle_text}</Text>
          </View>

          {/* Countdown bar — hidden when opened manually via Switch or episode sheet */}
          {!disableAutoSelect && (
            <View style={styles.countdownContainer}>
              <View style={styles.countdownRow}>
                <View style={styles.countdownTrack}>
                  <View style={[styles.countdownBar, { width: `${Math.max(0, (remaining / countdownSecs) * 100)}%` }]} />
                </View>
                <Text style={styles.countdownText}>{`Auto-selects in ${remaining}s`}</Text>
              </View>
            </View>
          )}

          {/* Card grid */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.gridContainer}
          >
            <CardGrid
              branches={choicePoint.branches || []}
              selectedId={selectedId}
              previouslyChosenId={previouslyChosenBranchId}
              onSelect={handleSelect}
              episodes={episodes}
            />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  contentArea: {
    backgroundColor: 'rgba(20,20,20,0.97)',
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 16,
    maxHeight: '90%',
  },
  header: {
    marginBottom: 16,
  },
  promptText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Arial',
    marginTop: 8,
    marginBottom: 4,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'Arial',
    marginTop: 2,
  },
  gridContainer: {
    paddingBottom: 20,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    position: 'relative',
    backgroundColor: '#2a2a2a',
  },
  cardPlaceholder: {
    backgroundColor: '#333',
  },
  badgePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Arial',
    letterSpacing: 0.3,
  },
  cardCaption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    zIndex: 2,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Arial',
    lineHeight: 16,
  },
  countdownContainer: {
    marginBottom: 12,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countdownTrack: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  countdownBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  countdownText: {
    color: '#FFD700',
    fontSize: 12,
    fontFamily: 'Arial',
    fontWeight: '600',
    flexShrink: 0,
  },
});

export default InteractiveChoiceModal;
