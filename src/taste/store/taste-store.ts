/**
 * TasteStore factory and global singleton management.
 */

import type { TasteStore } from '../types.js';
import { FileTasteStore } from './file-taste-store.js';

let _tasteStore: TasteStore | null = null;

export function getTasteStore(): TasteStore {
  if (!_tasteStore) {
    _tasteStore = new FileTasteStore();
  }
  return _tasteStore;
}

export function setTasteStore(store: TasteStore | null): void {
  if (_tasteStore && _tasteStore !== store) {
    _tasteStore.close();
  }
  _tasteStore = store;
}
