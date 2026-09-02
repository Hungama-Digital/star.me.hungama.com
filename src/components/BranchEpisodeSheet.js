import React, {
  useRef, useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, PanResponder, Dimensions, ScrollView, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from './LazyImage';

const ME_BADGE = require('../../assets/ic_me_badge.png');



const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.55;

const COLS = 5;
const PADDING = 16;
const GAP = 8;
const BOX_SIZE = Math.floor((SCREEN_W - PADDING * 2 - GAP * (COLS - 1)) / COLS);
const BRANCH_BOX_SIZE = Math.round(BOX_SIZE * 0.75);
const EPISODES_PER_PAGE = COLS * 6; // 30 per page

const BranchEpisodeSheet = ({
  visible,
  onClose,
  onEpisodePress,
  onPlaceholderPress,
  title = '',
  poster = '',
  genres = '',
  episodes = [],
  currentEpisodeIndex = 0,
  graph,
  hasChosen = false,
  activeBranchId = null,
  choicePointEpisodeId = null,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [activePage, setActivePage] = useState(0);

  // Jump to the page containing the current episode on open
  useEffect(() => {
    if (visible && episodes.length > 0) {
      setActivePage(Math.floor(currentEpisodeIndex / EPISODES_PER_PAGE));
    }
  }, [visible, currentEpisodeIndex, episodes.length]);

  // Slide in/out animation
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SHEET_HEIGHT);
      setModalVisible(true);
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    } else if (modalVisible) {
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT, duration: 250, useNativeDriver: true,
      }).start(() => setModalVisible(false));
    }
  }, [visible]);

  // Drag-to-close
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SCREEN_H * 0.15 || g.vy > 0.6) {
          onClose?.();
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const totalPages = Math.ceil(episodes.length / EPISODES_PER_PAGE);

  const pageLabel = useCallback((page) => {
    const start = page * EPISODES_PER_PAGE + 1;
    const end = Math.min((page + 1) * EPISODES_PER_PAGE, episodes.length);
    return `${start}-${end}`;
  }, [episodes.length]);

  // Derive story segments from graph when choice has been made
  const storySegments = useMemo(() => {
    if (!hasChosen || !graph?.choice_points?.[0]?.branches) return null;
    const branches = graph.choice_points[0].branches;
    return branches.map((br, i) => {
      const startIdx = episodes.findIndex(
        ep => ep.id === br.to_asset_id || ep.asset_id === br.to_asset_id,
      );
      const nextBranch = branches[i + 1];
      const nextToIdx = nextBranch
        ? episodes.findIndex(ep => ep.id === nextBranch.to_asset_id || ep.asset_id === nextBranch.to_asset_id)
        : -1;
      const endIdx = nextToIdx > 0 ? nextToIdx - 1 : episodes.length - 1;
      return {
        label: `Story ${i + 1}`,
        branchId: br.id,
        startIdx: Math.max(startIdx, 0),
        endIdx,
      };
    });
  }, [hasChosen, graph, episodes]);

  const activeStory = useMemo(
    () => storySegments?.find(s => s.branchId === activeBranchId) ?? storySegments?.[0] ?? null,
    [storySegments, activeBranchId],
  );

  // Row types:
  //  'normal'       — { cells }
  //  'open_header'  — { label }                             full-width Story label + gradient
  //  'open_inline'  — { leftCells, storyLabel, storyCells } label+line above right cells, same row as left cells
  //  'close_inline' — { storyCells, darkCells }             story cells + gradient below them, dark cells on right
  //  'close_footer' — {}                                    full-width gradient line
  const rows = useMemo(() => {
    const pageStart = activePage * EPISODES_PER_PAGE;
    const pageEps = episodes.slice(pageStart, pageStart + EPISODES_PER_PAGE);

    const cpGlobalIdx = choicePointEpisodeId
      ? episodes.findIndex(ep => ep.id === choicePointEpisodeId || ep.asset_id === choicePointEpisodeId)
      : -1;

    if (!hasChosen || !activeStory) {
      const result = [];
      let headerInserted = false;

      for (let i = 0; i < pageEps.length; i += COLS) {
        const chunk = pageEps.slice(i, i + COLS);
        const cells = chunk.map((ep, j) => ({
          ep, globalIdx: pageStart + i + j, isActiveBranch: false, isChoicePoint: pageStart + i + j === cpGlobalIdx,
        }));
        const firstPlaceholderLocal = chunk.findIndex(ep => ep?.isPlaceholder);
        const hasAnyPlaceholder = firstPlaceholderLocal !== -1;

        if (hasAnyPlaceholder && !headerInserted) {
          headerInserted = true;
          if (firstPlaceholderLocal === 0) {
            result.push({ type: 'open_header', key: `sep_preselect_${pageStart + i}`, label: 'Choose your story path' });
            result.push({ type: 'normal', key: `row_${pageStart + i}`, cells, isPureStory: true });
          } else {
            const leftCells = cells.slice(0, firstPlaceholderLocal);
            const storyCells = cells.slice(firstPlaceholderLocal);
            result.push({ type: 'open_inline', key: `row_open_${pageStart + i}`, leftCells, storyLabel: 'Choose your story path', storyCells });
          }
        } else {
          result.push({
            type: 'normal',
            key: `row_${pageStart + i}`,
            cells,
            isPureStory: hasAnyPlaceholder,
          });
        }
      }
      return result;
    }

    const { startIdx: storyStart, endIdx: storyEnd, label: storyLabel } = activeStory;
    const result = [];
    let ptr = 0;
    let openSepDone = false;
    let closeSepDone = false;

    const cell = (p) => ({
      ep: pageEps[p],
      globalIdx: pageStart + p,
      isActiveBranch: (pageStart + p) >= storyStart && (pageStart + p) <= storyEnd,
      isChoicePoint: (pageStart + p) === cpGlobalIdx,
    });

    while (ptr < pageEps.length) {
      const rowStartGIdx = pageStart + ptr;

      // Open separator: story starts somewhere in this row
      if (!openSepDone && storyStart >= rowStartGIdx && storyStart < rowStartGIdx + COLS) {
        const storyCol = storyStart - rowStartGIdx;
        if (storyCol === 0) {
          // Full-width header row, story cells come next
          result.push({ type: 'open_header', key: `sep_open_${rowStartGIdx}`, label: storyLabel });
          openSepDone = true;
          continue; // ptr unchanged; next iteration builds story cells row
        } else {
          // Compound row: pre-story cells (left, bottom-aligned) + right column [Story header above, story cells below]
          const leftCells = [];
          for (let c = 0; c < storyCol; c++) { leftCells.push(cell(ptr)); ptr++; }
          const storyCells = [];
          const remain = COLS - storyCol;
          for (let i = 0; i < remain && ptr < pageEps.length && (pageStart + ptr) <= storyEnd; i++) {
            storyCells.push(cell(ptr)); ptr++;
          }
          result.push({ type: 'open_inline', key: `row_open_${rowStartGIdx}`, leftCells, storyLabel, storyCells });
          openSepDone = true;
          continue;
        }
      }

      // Close separator: story ends somewhere in this row
      if (!closeSepDone && storyEnd >= rowStartGIdx && storyEnd < rowStartGIdx + COLS) {
        const endCol = storyEnd - rowStartGIdx;
        const storyCells = [];
        for (let c = 0; c <= endCol && ptr < pageEps.length; c++) { storyCells.push(cell(ptr)); ptr++; }
        const darkCells = [];
        const remain = COLS - storyCells.length;
        for (let i = 0; i < remain && ptr < pageEps.length; i++) { darkCells.push(cell(ptr)); ptr++; }
        if (darkCells.length > 0) {
          result.push({ type: 'close_inline', key: `row_close_${rowStartGIdx}`, storyCells, darkCells });
        } else {
          result.push({ type: 'normal', key: `row_${rowStartGIdx}`, cells: storyCells, isPureStory: true });
          result.push({ type: 'close_footer', key: `sep_close_${pageStart + ptr}` });
        }
        closeSepDone = true;
        continue;
      }

      // Normal row
      const cells = [];
      for (let c = 0; c < COLS && ptr < pageEps.length; c++) { cells.push(cell(ptr)); ptr++; }
      result.push({ type: 'normal', key: `row_${rowStartGIdx}`, cells, isPureStory: cells.every(c => c.isActiveBranch) });
    }

    return result;
  }, [activePage, episodes, hasChosen, activeStory, choicePointEpisodeId]);

  const renderEpCell = ({ ep, globalIdx, isActiveBranch, isChoicePoint }, boxSize = BOX_SIZE, useFlex = false) => {
    const sizeStyle = useFlex ? { flex: 1, height: boxSize } : { width: boxSize, height: boxSize };
    if (ep?.isPlaceholder) {
      return (
        <TouchableOpacity
          key={ep.id ?? globalIdx}
          activeOpacity={0.7}
          style={[styles.cell, sizeStyle]}
          onPress={() => onPlaceholderPress?.()}
        >
          <Text style={styles.cellText}>{ep.episodeNumber || globalIdx + 1}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={ep.id ?? globalIdx}
        activeOpacity={0.7}
        style={[styles.cell, sizeStyle, isActiveBranch && styles.cellBranch]}
        onPress={() => onEpisodePress?.(globalIdx, ep)}
      >
        <Text style={[styles.cellText, isActiveBranch && styles.cellTextBranch]}>
          {ep.episodeNumber || globalIdx + 1}
        </Text>
        {isChoicePoint && (
          <Image source={ME_BADGE} style={styles.fastMeBadge} resizeMode="contain" />
        )}
      </TouchableOpacity>
    );
  };

  if (!modalVisible) return null;

  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers}>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
        </View>

        {/* Header */}
        <View style={styles.header}>
          {poster ? (
            <LazyImage source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]} />
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.showTitle} numberOfLines={2}>{title || 'FastME Show'}</Text>
            {!!genres && (
              <Text style={styles.genreText} numberOfLines={1}>{genres}</Text>
            )}
            <Text style={styles.episodeCount}>{episodes.length} Episodes</Text>
          </View>
        </View>

        {/* Page tabs */}
        {totalPages > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScroll}
            contentContainerStyle={styles.tabContent}
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.tab, activePage === i && styles.tabActive]}
                onPress={() => setActivePage(i)}
              >
                <Text style={[styles.tabText, activePage === i && styles.tabTextActive]}>
                  {pageLabel(i)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Episode grid — row-based so separators share rows with episode cells */}
        <ScrollView
          contentContainerStyle={[styles.grid, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => {
            // full-width Story X label + gradient line
            if (row.type === 'open_header') {
              return (
                <View key={row.key} style={[styles.gridRow, styles.sepRow]}>
                  <View style={[styles.openSep, { flex: 1 }]}>
                    <Text style={styles.separatorLabel}>{row.label}</Text>
                    <LinearGradient colors={['#FF6623', '#CC44FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.separatorLine, { flex: 1 }]} />
                  </View>
                </View>
              );
            }

            if (row.type === 'close_footer') return null;

            // pre-story cells (full size) + story label above + smaller story cells
            if (row.type === 'open_inline') {
              return (
                <View key={row.key} style={[styles.gridRow, { alignItems: 'flex-end' }]}>
                  {row.leftCells.map(c => renderEpCell(c, BOX_SIZE))}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.openSep}>
                      <Text style={styles.separatorLabel}>{row.storyLabel}</Text>
                      <LinearGradient colors={['#FF6623', '#CC44FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.separatorLine, { flex: 1 }]} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: GAP }}>
                      {row.storyCells.map(c => renderEpCell(c, BRANCH_BOX_SIZE, true))}
                    </View>
                  </View>
                </View>
              );
            }

            // smaller story cells with gradient above, then full-size dark cells
            if (row.type === 'close_inline') {
              const darkW = row.darkCells.length * BOX_SIZE + (row.darkCells.length - 1) * GAP;
              return (
                <View key={row.key} style={[styles.gridRow, { alignItems: 'flex-end' }]}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <LinearGradient colors={['#FF6623', '#CC44FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.separatorLine, { alignSelf: 'stretch' }]} />
                    <View style={{ flexDirection: 'row', gap: GAP }}>
                      {row.storyCells.map(c => renderEpCell(c, BRANCH_BOX_SIZE, true))}
                    </View>
                  </View>
                  <View style={{ width: darkW, flexDirection: 'row', gap: GAP }}>
                    {row.darkCells.map(c => renderEpCell(c, BOX_SIZE))}
                  </View>
                </View>
              );
            }

            // normal row — pure story rows use smaller-height cells + gradient bar above
            if (row.isPureStory) {
              const n = row.cells.length;
              const partialWidth = n * BOX_SIZE + (n - 1) * GAP;
              return (
                <View key={row.key} style={{ gap: 4 }}>
                  <LinearGradient colors={['#FF6623', '#CC44FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.separatorLine, { alignSelf: 'stretch' }]} />
                  <View style={[styles.gridRow, n < COLS && { width: partialWidth }]}>
                    {row.cells.map(c => renderEpCell(c, BRANCH_BOX_SIZE, true))}
                  </View>
                </View>
              );
            }
            const fullRow = row.cells.length === COLS;
            return (
              <View key={row.key} style={styles.gridRow}>
                {row.cells.map(c => renderEpCell(c, BOX_SIZE, fullRow))}
              </View>
            );
          })}
        </ScrollView>
        {/* iOS home indicator */}
        <View style={styles.homeIndicatorWrap}>
          <View style={styles.homeIndicator} />
        </View>
      </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: '#111111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  header: {
    flexDirection: 'row',
    paddingHorizontal: PADDING,
    paddingBottom: 14,
    alignItems: 'flex-start',
  },
  poster: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 14,
    backgroundColor: '#2A2A2A',
  },
  posterPlaceholder: { backgroundColor: '#2A2A2A' },
  headerInfo: { flex: 1, justifyContent: 'center' },
  showTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Arial',
    marginBottom: 6,
    lineHeight: 30,
  },
  genreText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontFamily: 'Arial',
    marginBottom: 4,
  },
  episodeCount: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontFamily: 'Arial',
  },
  tabScroll: { flexGrow: 0, marginBottom: 14 },
  tabContent: {
    paddingLeft: PADDING,
    paddingRight: PADDING + 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    marginRight: 8,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: {
    color: '#AAAAAA',
    fontSize: 13,
    fontFamily: 'Arial',
    fontWeight: '600',
  },
  tabTextActive: { color: '#000000', fontWeight: '700' },
  grid: {
    flexDirection: 'column',
    paddingHorizontal: PADDING,
    gap: GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GAP,
    alignItems: 'center',
  },
  sepRow: {
    paddingVertical: 6,
  },
  openSep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  separatorLabel: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Arial',
    flexShrink: 0,
  },
  separatorLine: {
    height: 2,
  },
  cell: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cellBranch: {
    backgroundColor: '#1E3A4A',
    borderWidth: 0,
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Arial',
  },
  cellTextBranch: { color: '#FFFFFF' },
  fastMeBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 28,
    height: 22,
  },
  homeIndicatorWrap: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 4,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#555555',
  },
});

export default BranchEpisodeSheet;
