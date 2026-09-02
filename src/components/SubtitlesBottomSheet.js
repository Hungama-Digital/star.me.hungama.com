import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { labelForSubtitleLanguage, SUBTITLE_OFF } from '../utils/subtitleUtils';

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {{ language: string, subtitleUrl?: string }[]} props.subtitleTracks — from API; may be empty
 * @param {string} props.selectedLanguage — SUBTITLE_OFF or track.language
 * @param {(language: string) => void} props.onSelectLanguage
 */
export default function SubtitlesBottomSheet({
  visible,
  onClose,
  subtitleTracks,
  selectedLanguage,
  onSelectLanguage,
}) {
  const insets = useSafeAreaInsets();

  const options = useMemo(() => {
    const tracks = Array.isArray(subtitleTracks) ? subtitleTracks : [];
    const list = [{ id: SUBTITLE_OFF, label: 'No Subtitle' }];
    for (let i = 0; i < tracks.length; i += 1) {
      const t = tracks[i];
      const lang = t?.language != null ? String(t.language).trim() : '';
      if (!lang) continue;
      list.push({ id: lang, label: labelForSubtitleLanguage(lang) });
    }
    return list;
  }, [subtitleTracks]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Subtitles</Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.list}>
              {options.map((opt) => {
                const selected = selectedLanguage === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => {
                      onSelectLanguage(opt.id);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    {selected ? (
                      <View style={styles.selectedIcon}>
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#1F1F1F',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: Platform.OS === 'ios' ? '56%' : '60%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 18,
  },
  scroll: {
    maxHeight: 360,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 55,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rowLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 15,
    fontWeight: '500',
  },
  rowLabelSelected: {
    color: '#FFFFFF',
  },
  selectedIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#25B7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
