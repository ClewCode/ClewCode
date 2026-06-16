/**
 * PeerList — Ink component showing discovered peers in a table.
 */

import chalk from 'chalk';
import * as React from 'react';
import { Byline } from '../../components/design-system/Byline.js';
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js';
import { Pane } from '../../components/design-system/Pane.js';
import { Box, Text, useInput } from '../../ink.js';
import { getGlobalPeerServer } from '../../peer/PeerServer.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { formatPeerLatency, formatPeerLoad, getPeerHealth } from '../../peer/peerHealth.js';
import type { PeerInfo } from '../../peer/types.js';

type Props = {
  isSharing: boolean;
  myPeerId: string;
  onRefresh: () => void;
  onConnect: (peerId: string) => void;
  onClose: () => void;
};

function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return `..${path.slice(-(maxLen - 2))}`;
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export function PeerList({ isSharing, myPeerId: _myPeerId, onRefresh, onConnect, onClose }: Props): React.ReactNode {
  const [peers, setPeers] = React.useState<PeerInfo[]>([]);
  const store = getGlobalPeerStore();
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    setPeers(store.getPeers());
    // Trigger initial discovery scan on mount
    onRefresh();

    const interval = setInterval(() => {
      setPeers([...store.getPeers()]);
    }, 2000);
    return () => clearInterval(interval);
  }, [store, onRefresh]);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.return && peers.length > 0) {
      const selected = peers[selectedIndex];
      if (selected) {
        onConnect(selected.id);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(peers.length - 1, prev + 1));
      return;
    }

    if (key.tab) {
      onRefresh();
      return;
    }
  });

  const header = isSharing
    ? `You are sharing (port ${getGlobalPeerServer().port || '?'})`
    : 'Run /peer share to advertise your presence';

  return (
    <Pane color="claude">
      <Box flexDirection="column">
        {/* Header */}
        <Box marginBottom={1} flexDirection="column">
          <Text color="remember" bold>
            Peer Discovery
          </Text>
          <Text dimColor>{header}</Text>
          {peers.length === 0 && (
            <Text dimColor italic>
              No connected peers. Use /peer join to connect to one, or /peer discover to find available peers.
            </Text>
          )}
        </Box>

        {/* Peer table */}
        {peers.length > 0 && (
          <>
            {/* Column headers */}
            <Box flexDirection="row" paddingLeft={1} marginBottom={1}>
              <Text dimColor underline>
                {' '}
                Port Name Role Health Latency Load Shell Directory
              </Text>
            </Box>

            {/* Peer rows */}
            <Box flexDirection="column">
              {peers.map((peer, i) => {
                const isSelected = i === selectedIndex;
                const isOnline = peer.status === 'online';
                const shellDisplay = peer.shell || peer.platform || '?';
                const tags = store.getPeerTags(peer.id);
                const displayName = tags?.displayName ?? peer.hostname;
                const role = tags?.role ?? '';
                const health = getPeerHealth(peer);
                const healthColor =
                  health === 'healthy' ? 'ansi:green' : health === 'lagging' ? 'ansi:yellow' : 'ansi:red';
                const latency = formatPeerLatency(peer);
                const load = formatPeerLoad(peer);

                return (
                  <Box key={peer.id} flexDirection="row" paddingLeft={1}>
                    <Text color={healthColor} dimColor={!isSelected}>
                      {isSelected ? chalk.bold(`${isOnline ? '*' : 'o'} `) : `${isOnline ? '*' : 'o'} `}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {String(peer.port).padEnd(6)}
                    </Text>
                    <Text color={healthColor} bold={isSelected} dimColor={!isSelected}>
                      {displayName.padEnd(18)}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {role.padEnd(10) || chalk.dim('-').padEnd(10)}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {health.padEnd(9)}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {latency.padEnd(8)}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {load.padEnd(8)}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {shellDisplay.padEnd(14)}
                    </Text>
                    <Text dimColor={!isSelected} color={healthColor}>
                      {truncatePath(peer.cwd, 28).padEnd(30)}
                    </Text>
                    <Text dimColor color={healthColor}>
                      {timeAgo(peer.lastSeen)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </>
        )}

        {/* Footer */}
        <Box marginTop={1}>
          <Byline>
            {peers.length > 0 && <KeyboardShortcutHint shortcut="Enter" action="connect" />}
            <KeyboardShortcutHint shortcut="Tab" action="refresh" />
            <KeyboardShortcutHint shortcut="Esc" action="close" />
          </Byline>
        </Box>
      </Box>
    </Pane>
  );
}

/**
 * Format peer info as plain text for non-interactive display.
 */
export function formatPeerList(peers: PeerInfo[], isSharing: boolean): string {
  const lines: string[] = [];

  lines.push(isSharing ? 'You are sharing' : 'Not sharing. Run /peer share to advertise.');
  lines.push('');

  if (peers.length === 0) {
    lines.push('No peers found.');
    return lines.join('\n');
  }

  const store = getGlobalPeerStore();
  lines.push(`  Port  Name              Role       Health   Latency Load    Shell         Directory`);
  lines.push(`  ${'-'.repeat(104)}`);

  for (const peer of peers) {
    const indicator = peer.status === 'online' ? '*' : 'o';
    const shellDisplay = peer.shell || peer.platform || '?';
    const tags = store.getPeerTags(peer.id);
    const displayName = tags?.displayName ?? peer.hostname;
    const role = tags?.role ?? '-';
    const health = getPeerHealth(peer);
    const latency = formatPeerLatency(peer);
    const load = formatPeerLoad(peer);
    lines.push(
      `  ${indicator} ${String(peer.port).padEnd(6)}${displayName.padEnd(18)}${role.padEnd(10)}${health.padEnd(9)}${latency.padEnd(8)}${load.padEnd(8)}${shellDisplay.padEnd(14)}${truncatePath(peer.cwd, 32)}`,
    );
  }

  // Show join commands
  lines.push('');
  lines.push('Join a peer:');
  for (const peer of peers) {
    const tags = store.getPeerTags(peer.id);
    const name = tags?.displayName ?? peer.hostname;
    lines.push(`  /peer join ${peer.ip}:${peer.port}   (${name})`);
  }

  return lines.join('\n');
}
