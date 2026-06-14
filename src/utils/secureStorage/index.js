import { createFallbackStorage } from './fallbackStorage.js';
import { macOsKeychainStorage } from './macOsKeychainStorage.js';
import { plainTextStorage } from './plainTextStorage.js';
/**
 * Get the appropriate secure storage implementation for the current platform
 */
export function getSecureStorage() {
    if (process.platform === 'darwin') {
        return createFallbackStorage(macOsKeychainStorage, plainTextStorage);
    }
    // TODO: add libsecret support for Linux
    return plainTextStorage;
}
