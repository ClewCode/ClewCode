import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalDiscovery } from '../peer/PeerDiscovery.js';
import { getGlobalPeerServer } from '../peer/PeerServer.js';
import { getGlobalPeerStore } from '../peer/PeerStore.js';
import { summarizePeers } from '../peer/peerHealth.js';
import type { PeerInfo } from '../peer/types.js';

import { logForDebugging } from '../utils/debug.js';

export function PeerStatusLine(): React.ReactNode {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [sharing, setSharing] = useState(false);
  const [myName, setMyName] = useState('');
  const [myRole, setMyRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    const store = getGlobalPeerStore();
    const discovery = getGlobalDiscovery();
    const server = getGlobalPeerServer();

    const update = () => {
      const storePeers = store.getPeers();
      const isSharing = discovery.isSharing;
      logForDebugging(`[PeerStatusLine] Update: peers=${storePeers.length}, sharing=${isSharing}, storeConnections=${store.getConnections().length}`);
      setPeers(storePeers);
      setSharing(isSharing);
      setMyName(server.extraInfo.displayName || discovery.hostname);
      setMyRole(server.extraInfo.role);
    };
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, []);

  logForDebugging(`[PeerStatusLine] Render: peers=${peers.length}, sharing=${sharing}`);

  if (peers.length === 0 && !sharing) return null;

  const summary = summarizePeers(peers);
  const peerText =
    peers.length > 0
      ? ` | peer ${summary.healthy}/${peers.length} ok${summary.lagging > 0 ? ` ${summary.lagging} slow` : ''}${summary.offline > 0 ? ` ${summary.offline} off` : ''}${summary.avgLatencyMs !== undefined ? ` avg ${Math.round(summary.avgLatencyMs)}ms` : ''}`
      : '';

  return (
    <Box paddingLeft={1}>
      <Text dimColor>
        {sharing
          ? `⬡ sharing: ${myName}${myRole ? ` (${myRole})` : ''}`
          : `⬡ me: ${myName}${myRole ? ` (${myRole})` : ''}`}
        {peerText}
      </Text>
    </Box>
  );
}
