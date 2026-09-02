/**
 * Simple asset utilities for ReelsScreen sharing
 */

/**
 * Create a standardized asset object for sharing
 * @param {string} filePath - Path to the asset file
 * @param {Object} additionalData - Additional metadata
 * @returns {Object} Standardized asset object
 */
export const createShareableAsset = (filePath, additionalData = {}) => {
  if (!filePath) return null;

  const pathParts = filePath.split('/');
  const fileName = pathParts[pathParts.length - 1];
  
  // Determine category from path
  let category = null;
  if (pathParts.includes('carousels')) {
    category = 'carousels';
  } else if (pathParts.includes('thumbnails')) {
    category = 'thumbnails';
  } else if (pathParts.includes('icons')) {
    category = 'icons';
  } else if (pathParts.includes('reels')) {
    category = 'reels';
  } else if (pathParts.includes('series')) {
    category = 'series';
  }

  return {
    id: additionalData.id || fileName,
    name: additionalData.name || fileName,
    type: additionalData.type || 'video',
    category: additionalData.category || category,
    description: additionalData.description || `A ${additionalData.type || 'video'} from Hungama`,
    creator: additionalData.creator || 'Unknown Creator',
    thumbnail: additionalData.thumbnail || null,
    createdAt: additionalData.createdAt || new Date().toISOString(),
    tags: additionalData.tags || []
  };
}; 

export const getSeriesGenres = (asset) => {
  const g = asset.seriesGenres;
  if (Array.isArray(g)) {
    const first = g[0];
    if (first != null && typeof first === 'object' && (first.genreName != null || first.title != null)) {
      return g.map((item) => item.genreName ?? item.title ?? '').filter(Boolean).join(' · ');
    }
    return g.join(' · ');
  }
  if (typeof g === 'string') return g;
  const fallback = asset.genre;
  if (typeof fallback === 'string') return fallback;
  if (Array.isArray(fallback)) {
    return fallback.map((item) => typeof item === 'object' ? (item.genreName ?? item.title ?? '') : item).filter(Boolean).join(' · ') || '';
  }
  return '';
};