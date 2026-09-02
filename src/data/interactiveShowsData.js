/**
 * interactiveShowsData.js
 * Static data module for interactive shows — no API calls.
 * Sources: if-only-you-were-mine.json, tied-by-fate.json, the-phoenix-conspiracy.json, im-obsessed-with-my-boss-part-ii.json
 */

import IF_ONLY_RAW from './if-only-you-were-mine.json';
import BOSS_RAW from './im-obsessed-with-my-boss-part-ii.json';
import FATE_RAW from './tied-by-fate.json';
import PHOENIX_RAW from './the-phoenix-conspiracy.json';

function normalizeShow(rawData) {
  const showKey = Object.keys(rawData)[0];
  const show = rawData[showKey];
  const ag = Array.isArray(show.assetgroup) ? show.assetgroup[0] : show.assetgroup;
  const episodes = (show.assetlist?.data || []);

  const seriesData = {
    id: String(ag.agdlmId),
    agdlmId: ag.agdlmId,
    asset_group_id: String(ag.agdlmId),
    path: String(ag.path),
    title: ag.title || ag.label || showKey,
    description: ag.description || '',
    is_interactive: true,
    isPremium: ag.isPremium ?? 0,
    verticalFilePath: ag.verticalFilePath || ag.uploadVerticalImage || '',
    horizontalFilePath: ag.horizontalFilePath || ag.uploadHorizontalImage || '',
    poster: ag.vodOrLivePosterImageFilePath || ag.verticalFilePath || '',
    thumb: ag.thumbFilePath || ag.uploadThumbImage || '',
    trailerUrl: ag.hlsUrl || ag.trailer_url || '',
    previewUrl: ag.preview_url || ag.asset_group_preview_url || '',
    genre: ag.genre || [],
    geners: Array.isArray(ag.genre)
      ? ag.genre.map((g) => g.title || g.genreName || '').filter(Boolean).join(' · ')
      : '',
    assetCount: episodes.length,
    totalEpisodes: episodes.length,
  };

  const normalizedEpisodes = episodes.map((ep, idx) => ({
    id: ep.playbackid || String(ep.path || idx),
    asset_id: ep.playbackid || String(ep.path || idx),
    path: String(ep.path || idx),
    playbackid: ep.playbackid || '',
    videoUrl: ep.hlsUrl || ep.hls_url || '',
    hlsUrl: ep.hlsUrl || ep.hls_url || '',
    title: ag.title || showKey,
    episodeNumber: idx + 1,
    is_interactive: true,
    seriesId: String(ag.agdlmId),
    assetGroupId: String(ag.agdlmId),
    poster: ag.vodOrLivePosterImageFilePath || ag.verticalFilePath || '',
    verticalFilePath: ag.verticalFilePath || '',
    horizontalFilePath: ag.horizontalFilePath || '',
    subtitle: Array.isArray(ep.subtitle) ? ep.subtitle : [],
    // Cliffhanger / hook metadata for future use
    tropesName: ep.tropesName || '',
    cliffhangerStrength: ep.cliffhangerStrength || '',
    openingHookStrength: ep.openingHookStrength || '',
  }));

  return { seriesData, episodes: normalizedEpisodes };
}

// Build at module load — runs once, cached for session
const SHOWS = [
  normalizeShow(IF_ONLY_RAW),
  normalizeShow(BOSS_RAW),
  normalizeShow(FATE_RAW),
  normalizeShow(PHOENIX_RAW),
];

// Map: agdlmId string → show
const SHOW_BY_ID = {};
SHOWS.forEach((s) => {
  SHOW_BY_ID[s.seriesData.agdlmId] = s;
  SHOW_BY_ID[String(s.seriesData.agdlmId)] = s;
});

/** All interactive show seriesData objects (for listing). */
export const ALL_INTERACTIVE_SERIES = SHOWS.map((s) => s.seriesData);

/** All episodes for a given agdlmId (number or string). Returns [] if not found. */
export function getEpisodesForShow(showId) {
  const show = SHOW_BY_ID[showId] || SHOW_BY_ID[String(showId)];
  return show ? show.episodes : [];
}

/** SeriesData for a given agdlmId. Returns null if not found. */
export function getSeriesData(showId) {
  const show = SHOW_BY_ID[showId] || SHOW_BY_ID[String(showId)];
  return show ? show.seriesData : null;
}

export default SHOWS;
