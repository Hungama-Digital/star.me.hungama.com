import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { isAllowlisted } from '../config/interactiveAllowlist';

const InteractiveShowContext = createContext(null);

const INITIAL_STATE = {
  activeShow: null,
  choicePath: [],
  currentBranchId: null,
  lastChoicePoint: null,
  switchTooltipSeen: false,
};

export const InteractiveShowProvider = ({ children }) => {
  const [state, setState] = useState(INITIAL_STATE);

  const selectBranch = useCallback(async (choicePointId, branchId, showId) => {
    setState((prev) => {
      const entry = { choicePointId, branchId, chosenAt: Date.now() };
      const choicePath = [...prev.choicePath, entry];
      const next = { ...prev, choicePath, currentBranchId: branchId };
      if (showId) {
        const storageKey = `interactive_show_progress_${showId}`;
        AsyncStorage.setItem(storageKey, JSON.stringify({ choicePath, currentBranchId: branchId })).catch(() => {});
      }
      return next;
    });
  }, []);

  const setLastChoicePoint = useCallback((choicePoint) => {
    setState((prev) => ({ ...prev, lastChoicePoint: choicePoint }));
  }, []);

  const setActiveShow = useCallback(async (showId, graph) => {
    // Reset all per-show state immediately so no previous show's branch bleeds in
    setState((prev) => ({
      ...INITIAL_STATE,
      switchTooltipSeen: prev.switchTooltipSeen,
      activeShow: showId ? { showId, graph } : null,
    }));
    if (!showId) return;
    try {
      const stored = await AsyncStorage.getItem(`interactive_show_progress_${showId}`);
      if (stored) {
        const { choicePath, currentBranchId } = JSON.parse(stored);
        setState((prev) => ({ ...prev, choicePath: choicePath || [], currentBranchId: currentBranchId || null }));
      }
    } catch (_) {}
  }, []);

  const reopenLastChoice = useCallback(() => {
    // Caller reads state.lastChoicePoint and re-shows the modal
  }, []);

  const resetShow = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const markSwitchTooltipSeen = useCallback(async () => {
    setState((prev) => ({ ...prev, switchTooltipSeen: true }));
    try {
      await AsyncStorage.setItem('interactive_show_switch_tooltip_seen', '1');
    } catch (_) {}
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('interactive_show_switch_tooltip_seen')
      .then((val) => { if (val === '1') setState((p) => ({ ...p, switchTooltipSeen: true })); })
      .catch(() => {});
  }, []);

  const value = {
    ...state,
    selectBranch,
    setLastChoicePoint,
    setActiveShow,
    reopenLastChoice,
    resetShow,
    markSwitchTooltipSeen,
  };

  return (
    <InteractiveShowContext.Provider value={value}>
      {children}
    </InteractiveShowContext.Provider>
  );
};

export const useInteractiveShow = () => {
  const ctx = useContext(InteractiveShowContext);
  if (!ctx) throw new Error('useInteractiveShow must be used within InteractiveShowProvider');
  return ctx;
};

// Hook: returns true when the current user is on the interactive-show allowlist.
export const useInteractiveEnabled = () => {
  const { user } = useAuth();
  const mobile = user?.phoneNumber || user?.mobile || '';
  return isAllowlisted(mobile);
};

export default InteractiveShowContext;
