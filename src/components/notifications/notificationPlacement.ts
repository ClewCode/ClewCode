import type { Notification } from '../../context/notifications.js';

const PROMPT_ONLY_NOTIFICATION_KEYS = new Set(['effort-level', 'external-editor-hint']);

/**
 * Notifications that render in the footer's right-hand slot instead of the
 * left column. The effort indicator is a persistent statement about the
 * session's configuration rather than an event, so it reads better parked on
 * the right next to the other status indicators than competing for the left
 * column where transient messages appear.
 */
const RIGHT_ALIGNED_NOTIFICATION_KEYS = new Set(['effort-level']);

export function shouldShowNotificationOnRight(notification: Notification): boolean {
  return RIGHT_ALIGNED_NOTIFICATION_KEYS.has(notification.key);
}

function isLogoNotificationKey(key: string): boolean {
  return (
    key.startsWith('mcp-') ||
    key.startsWith('channels-blocked-') ||
    key.includes('auth') ||
    key.includes('error') ||
    key.includes('failed') ||
    key.includes('needs-auth') ||
    key.includes('rate-limit') ||
    key.includes('settings')
  );
}

export function shouldShowNotificationInLogo(notification: Notification): boolean {
  if (PROMPT_ONLY_NOTIFICATION_KEYS.has(notification.key)) {
    return false;
  }

  if ('text' in notification && notification.text.includes('/effort')) {
    return false;
  }

  if ('color' in notification && (notification.color === 'error' || notification.color === 'warning')) {
    return true;
  }

  return isLogoNotificationKey(notification.key);
}

export function shouldShowNotificationNearPrompt(notification: Notification): boolean {
  // Right-aligned notifications are rendered by NotificationRightSlot, not by
  // the left column — without this they would appear in both places.
  if (shouldShowNotificationOnRight(notification)) {
    return false;
  }
  return !shouldShowNotificationInLogo(notification);
}
