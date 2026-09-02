import { useState, useEffect, useRef } from 'react';

/**
 * Watches playback state and fires onChoicePoint when a graph choice point is triggered.
 * - trigger_timestamp_sec === null → fires when isEpisodeEnded for the matching asset
 * - trigger_timestamp_sec is a number → fires when playbackPositionSec >= that value
 * Uses a ref Set to prevent double-fire per choice_point id within the same session.
 */
const useChoicePointTrigger = (
  graph,
  currentAssetId,
  playbackPositionSec,
  isEpisodeEnded,
  onChoicePoint,
) => {
  const [pendingChoicePoint, setPendingChoicePoint] = useState(null);
  const firedIds = useRef(new Set());
  const onChoicePointRef = useRef(onChoicePoint);

  useEffect(() => {
    onChoicePointRef.current = onChoicePoint;
  }, [onChoicePoint]);

  useEffect(() => {
    if (!graph?.choice_points || !currentAssetId) return;

    for (const cp of graph.choice_points) {
      if (firedIds.current.has(cp.id)) continue;
      if (cp.trigger_asset_id !== currentAssetId) continue;

      const tsNull = cp.trigger_timestamp_sec === null || cp.trigger_timestamp_sec === undefined;
      const shouldFire = tsNull
        ? isEpisodeEnded
        : typeof playbackPositionSec === 'number' && playbackPositionSec >= cp.trigger_timestamp_sec;

      if (shouldFire) {
        firedIds.current.add(cp.id);
        setPendingChoicePoint(cp);
        onChoicePointRef.current?.(cp);
        break;
      }
    }
  }, [graph, currentAssetId, playbackPositionSec, isEpisodeEnded]);

  return { pendingChoicePoint };
};

export default useChoicePointTrigger;
