import type { Notification } from '../../context/notifications.js';

const PROMPT_ONLY_NOTIFICATION_KEYS = new Set(['effort-level', 'external-editor-hint']);

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
  return !shouldShowNotificationInLogo(notification);
}
