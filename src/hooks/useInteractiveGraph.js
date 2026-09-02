import { useState, useEffect } from 'react';
import { getCachedGraph } from '../data/interactiveGraphs';

const useInteractiveGraph = (showId) => {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!showId) {
      setLoading(false);
      return;
    }
    try {
      setGraph(getCachedGraph(showId));
    } catch (e) {
      setError(e?.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [showId]);

  return { graph, loading, error };
};

export default useInteractiveGraph;
