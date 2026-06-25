import spawn from 'nano-spawn';
import { getMacOsKeychainStorageServiceName } from 'src/utils/secureStorage/macOsKeychainHelpers.js';

export async function maybeRemoveApiKeyFromMacOSKeychainThrows(): Promise<void> {
  if (process.platform === 'darwin') {
    const storageServiceName = getMacOsKeychainStorageServiceName();
    let exitCode = 0;
    try {
      await spawn(`security delete-generic-password -a $USER -s "${storageServiceName}"`, {
        shell: true,
      });
    } catch (e) {
      exitCode = e.exitCode ?? 1;
    }
    if (exitCode !== 0) {
      throw new Error('Failed to delete keychain entry');
    }
  }
}

export function normalizeApiKeyForConfig(apiKey: string): string {
  return apiKey.slice(-20);
}
