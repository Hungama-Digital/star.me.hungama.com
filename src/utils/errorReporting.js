/**
 * Report error to console only - do not show Alert to user.
 * Use this instead of Alert.alert() when displaying errors to hide them from the client.
 */
export const reportError = (title, message, details) => {
  console.error(`[App Error] ${title}: ${message}`, details ?? '');
};

/**
 * Replaces Alert.alert for error cases - logs to console only, does not show UI.
 */
export const reportErrorAlert = (title, message, _buttons) => {
  reportError(title, message);
};
