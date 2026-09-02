/**
 * Parse semver string to [major, minor, patch].
 * Handles "1.2.5", "2.0", "1" etc.
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') return [0, 0, 0];
  const parts = version.trim().split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Compare current app version with remote (latest) version.
 * - If remote major > current major → force update
 * - If same major but remote > current (minor/patch) → soft update
 * - Else → no update
 * @param {string} currentVersion - e.g. "1.1.1"
 * @param {string} remoteVersion - e.g. "2.0.0" or "1.2.0"
 * @returns {'force'|'soft'|'none'}
 */
export function compareVersions(currentVersion, remoteVersion) {
  const current = parseVersion(currentVersion);
  const remote = parseVersion(remoteVersion);

  if (remote[0] > current[0]) return 'force';
  if (remote[0] < current[0]) return 'none';
  if (remote[1] > current[1]) return 'soft';
  if (remote[1] < current[1]) return 'none';
  if (remote[2] > current[2]) return 'soft';
  return 'none';
}
