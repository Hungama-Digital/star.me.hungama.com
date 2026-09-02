/**
 * interactiveGraphs.js
 * Builds static interactive branching graphs from real episode data.
 * Prompts and branch labels come from Interactive_Show_Scenarios_v6.docx.
 */
import { getEpisodesForShow, getSeriesData } from './interactiveShowsData';

// agdlmId → show-specific choice point config from v6 doc
const SHOW_CONFIGS = {
  '162': { // If Only You Were Mine
    prompt_text: 'How does he approach his feelings for Sarah?',
    branches: [
      { label: 'He confronts Mark directly.', badge_type: 'most_watched', badge_value: '58%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/If%20Only%20You%20Were%20Mine/He%20confronts%20Mark%20directly..png?updatedAt=1779890476729' },
      { label: 'He writes Sarah a letter and leaves it unsent.', badge_type: 'recommended', badge_value: null, thumbnail_url: 'https://images1.hungama.com/Fast%20Me/If%20Only%20You%20Were%20Mine/He%20writes%20Sarah%20a%20letter%20and%20leaves%20it%20unsent.png?updatedAt=1779890476728' },
      { label: 'He tells a mutual friend what he saw.', badge_type: 'people_watched', badge_value: '25%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/If%20Only%20You%20Were%20Mine/He%20tells%20a%20mutual%20friend%20what%20he%20saw.png?updatedAt=1779890476667' },
      { label: 'He backs off and keeps watching.', badge_type: 'people_watched', badge_value: '17%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/If%20Only%20You%20Were%20Mine/He%20backs%20off%20and%20keeps%20watching.png?updatedAt=1779890476568' },
    ],
  },
  '164': { // I'm Obsessed With My Boss Part II
    prompt_text: 'What will Ricardo do about the blackmail?',
    branches: [
      { label: 'Ricardo pays and hires a PI.', badge_type: 'most_watched', badge_value: '60%' },
      { label: 'Ricardo confronts Lucilia directly.', badge_type: 'recommended', badge_value: null },
      { label: 'Ricardo goes public on his own terms.', badge_type: 'people_watched', badge_value: '28%' },
      { label: 'Ricardo says nothing and waits.', badge_type: 'people_watched', badge_value: '12%' },
    ],
  },
  '165': { // Tied By Fate
    prompt_text: 'How do Mia and James handle Mrs. Chen?',
    branches: [
      { label: 'They invite her to dinner and over-perform.', badge_type: 'most_watched', badge_value: '60%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/Tied%20By%20Fate/A%20%20They%20invite%20her%20to%20dinner%20and%20over-perform.png?updatedAt=1779890444429' },
      { label: 'James flirts with her to distract her.', badge_type: 'recommended', badge_value: null, thumbnail_url: 'https://images1.hungama.com/Fast%20Me/Tied%20By%20Fate/B%20%20James%20flirts%20with%20her%20to%20distract%20her..png?updatedAt=1779890444423' },
      { label: 'Mia accidentally tells her everything.', badge_type: 'people_watched', badge_value: '28%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/Tied%20By%20Fate/C%20%20Mia%20accidentally%20tells%20her%20everything.png?updatedAt=1779890444581' },
    ],
  },
  '166': { // The Phoenix Conspiracy
    prompt_text: 'How will the PI approach the dead drop?',
    branches: [
      { label: 'He goes alone at night.', badge_type: 'most_watched', badge_value: '60%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/The%20Phoenix%20Conspiracy/He%20goes%20alone%20at%20night..png?updatedAt=1779890419319' },
      { label: 'He takes the woman with him.', badge_type: 'recommended', badge_value: null, thumbnail_url: 'https://images1.hungama.com/Fast%20Me/The%20Phoenix%20Conspiracy/He%20takes%20the%20woman%20with%20him..png?updatedAt=1779890419250' },
      { label: 'He tips off his police contact first.', badge_type: 'people_watched', badge_value: '28%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/The%20Phoenix%20Conspiracy/He%20tips%20off%20his%20police%20contact%20first.png?updatedAt=1779890418740' },
      { label: 'He sets a trap and lets someone else find it.', badge_type: 'people_watched', badge_value: '12%', thumbnail_url: 'https://images1.hungama.com/Fast%20Me/The%20Phoenix%20Conspiracy/He%20sets%20a%20trap%20and%20lets%20someone%20else%20find%20it.png?updatedAt=1779890418802' },
    ],
  },
};

const _cache = new Map();

export function buildGraphForShow(showId) {
  const episodes = getEpisodesForShow(showId);
  const series = getSeriesData(showId);
  if (!episodes || episodes.length < 4) return null;

  const config = SHOW_CONFIGS[String(showId)];
  const numBranches = config ? config.branches.length : 4;
  const promptText = config ? config.prompt_text : 'Choose your story path';
  const subtitleText = 'Choose your story path  •  Video continues after selection';

  const poster = series?.poster || series?.verticalFilePath || '';
  const STORY_EPISODE_COUNT = 12;
  const ep1 = episodes[0];

  const fallbackImages = [
    series?.verticalFilePath || poster,
    series?.horizontalFilePath || poster,
    series?.thumb || poster,
    poster,
  ];

  const id = String(showId);

  const branches = Array.from({ length: numBranches }, (_, i) => {
    const brCfg = config?.branches[i] || { label: String.fromCharCode(65 + i), badge_type: 'people_watched', badge_value: null };
    const startEp = episodes[1 + i * STORY_EPISODE_COUNT];
    return {
      id: `br_${id}_s${i + 1}`,
      to_asset_id: startEp.id,
      display_label: brCfg.label,
      badge_type: brCfg.badge_type,
      badge_value: brCfg.badge_value,
      thumbnail_url: brCfg.thumbnail_url || fallbackImages[i] || poster,
      order_index: i,
    };
  });

  return {
    graph_id: `graph_${id}_v1`,
    graph_version: 1,
    choice_points: [
      {
        id: `cp_${id}_1`,
        trigger_asset_id: ep1.id,
        trigger_timestamp_sec: null,
        prompt_text: promptText,
        subtitle_text: subtitleText,
        countdown_seconds: 8,
        default_branch_id: `br_${id}_s1`,
        branches,
      },
    ],
  };
}

export function getCachedGraph(showId) {
  const key = String(showId);
  if (!_cache.has(key)) _cache.set(key, buildGraphForShow(key));
  return _cache.get(key);
}

export function clearGraphCache() {
  _cache.clear();
}
