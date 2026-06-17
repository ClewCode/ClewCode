import { profileCheckpoint } from './utils/startupProfiler.js';

console.error('[DEBUG] After startupProfiler import');

profileCheckpoint('main_tsx_entry');

import { startMdmRawRead } from './utils/settings/mdm/rawRead.js';

console.error('[DEBUG] After startMdmRawRead import');

startMdmRawRead();

console.error('[DEBUG] After keychainPrefetch import');
