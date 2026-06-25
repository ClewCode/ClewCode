import type * as React from 'react';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';
import { AutoUpdater } from './AutoUpdater.js';

type Props = {
  isUpdating: boolean;
  onChangeIsUpdating: (isUpdating: boolean) => void;
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void;
  autoUpdaterResult: AutoUpdaterResult | null;
  showSuccessMessage: boolean;
  verbose: boolean;
};

export function AutoUpdaterWrapper(props: Props): React.ReactNode {
  return <AutoUpdater {...props} />;
}
