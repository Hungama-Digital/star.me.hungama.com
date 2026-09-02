/**
 * Parse SRT content into cues with start/end in seconds.
 * @param {string} srtText
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function parseSrt(srtText) {
  if (typeof srtText !== 'string' || !srtText.trim()) return [];
  const cues = [];
  const normalized = srtText.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\n+/);

  const toSeconds = (hh, mm, ss, ms) =>
    parseInt(hh, 10) * 3600 +
    parseInt(mm, 10) * 60 +
    parseInt(ss, 10) +
    parseInt(ms, 10) / 1000;

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    let idx = 0;
    if (/^\d+$/.test(lines[0].trim())) idx = 1;

    const timeLine = lines[idx];
    const match = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!match) continue;

    const start = toSeconds(match[1], match[2], match[3], match[4]);
    const end = toSeconds(match[5], match[6], match[7], match[8]);
    const text = lines
      .slice(idx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (text) cues.push({ start, end, text });
  }

  return cues;
}

export function getCueTextAtTime(cues, timeSeconds) {
  if (!Array.isArray(cues) || cues.length === 0) return '';
  const t = typeof timeSeconds === 'number' ? timeSeconds : 0;
  for (let i = 0; i < cues.length; i += 1) {
    const c = cues[i];
    if (t >= c.start && t < c.end) return c.text;
  }
  return '';
}

const LANG_LABELS = {
  eng: 'English',
  en: 'English',
  hin: 'Hindi',
  hi: 'Hindi',
  fra: 'Français',
  fr: 'Français',
  deu: 'Deutsch',
  de: 'Deutsch',
  spa: 'Español',
  es: 'Español',
  ita: 'Italian',
  it: 'Italian',
  por: 'Portuguese',
  pt: 'Portuguese',
  jpn: 'Japanese',
  ja: 'Japanese',
  kor: 'Korean',
  ko: 'Korean',
  zho: 'Chinese',
  zh: 'Chinese',
  ara: 'Arabic',
  ar: 'Arabic',
};

export function labelForSubtitleLanguage(code) {
  if (!code || code === 'off') return 'Off';
  const c = String(code).toLowerCase().trim();
  return LANG_LABELS[c] || String(code).toUpperCase();
}

export const SUBTITLE_OFF = 'off';
