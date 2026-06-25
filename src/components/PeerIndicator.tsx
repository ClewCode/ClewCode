import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalPeerStore } from '../peer/PeerStore.js';

export function PeerIndicator(): React.ReactNode {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let store: ReturnType<typeof getGlobalPeerStore> | undefined;

    try {
      store = getGlobalPeerStore();
    } catch {
      return;
    }

    const update = () => setCount(store!.getPeers().filter(p => p.status === 'online').length);
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, []);

  if (count === 0) return null;

  return (
    <Box>
      <Text dimColor>
        {count} peer{count !== 1 ? 's' : ''}
      </Text>
    </Box>
  );
}
