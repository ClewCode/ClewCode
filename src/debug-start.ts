import { profileCheckpoint, profileReport } from './utils/startupProfiler.js';
console.error('[DEBUG] After startupProfiler import');

profileCheckpoint('main_tsx_entry');
import { startMdmRawRead } from './utils/settings/mdm/rawRead.js';
console.error('[DEBUG] After startMdmRawRead import');

startMdmRawRead();
import { ensureKeychainPrefetchCompleted, startKeychainPrefetch } from './utils/secureStorage/keychainPrefetch.js';
console.error('[DEBUG] After keychainPrefetch import');
