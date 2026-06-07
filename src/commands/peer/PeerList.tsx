/**
 * PeerList — Ink component showing discovered peers in a table.
 */

import chalk from 'chalk';
import * as React from 'react';
import { Box, Text, useInput } from '../../ink.js';
import { Pane } from '../../components/design-system/Pane.js';
import { Byline } from '../../components/design-system/Byline.js';
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js';
import { getGlobalPeerStore, type PeerTags } from '../../peer/PeerStore.js';
import { getGlobalPeerServer } from '../../peer/PeerServer.js';
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

export function PeerList({ isSharing, myPeerId, onRefresh, onConnect, onClose }: Props): React.ReactNode {
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
          <Text color="remember" bold>Peer Discovery</Text>
          <Text dimColor>{header}</Text>
          {peers.length === 0 && (
            <Text dimColor italic>No connected peers. Use /peer join to connect to one, or /peer discover to find available peers.</Text>
          )}
        </Box>

        {/* Peer table */}
        {peers.length > 0 && (
          <>
            {/* Column headers */}
            <Box flexDirection="row" paddingLeft={1} marginBottom={1}>
              <Text dimColor underline>  Port  Name              Role       Shell         Directory</Text>
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

                return (
                  <Box key={peer.id} flexDirection="row" paddingLeft={1}>
                    <Text color={isOnline ? 'ansi:green' : 'ansi:white'} dimColor={!isSelected}>
                      {isSelected ? chalk.bold(`${isOnline ? '*' : 'o'} `) : `${isOnline ? '*' : 'o'} `}
                    </Text>
                    <Text dimColor={!isSelected} color={isOnline ? 'ansi:green' : 'ansi:white'}>
                      {String(peer.port).padEnd(6)}
                    </Text>
                    <Text color={isOnline ? 'ansi:green' : 'ansi:white'} bold={isSelected} dimColor={!isSelected}>
                      {displayName.padEnd(18)}
                    </Text>
                    <Text dimColor={!isSelected} color={isOnline ? 'ansi:green' : 'ansi:white'}>
                      {role.padEnd(10) || chalk.dim('-').padEnd(10)}
                    </Text>
                    <Text dimColor={!isSelected} color={isOnline ? 'ansi:green' : 'ansi:white'}>
                      {shellDisplay.padEnd(14)}
                    </Text>
                    <Text dimColor={!isSelected} color={isOnline ? 'ansi:green' : 'ansi:white'}>
                      {truncatePath(peer.cwd).padEnd(32)}
                    </Text>
                    <Text dimColor color={isOnline ? 'ansi:green' : 'ansi:white'}>
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
  lines.push(`  Port  Name              Role       Shell         Directory`);
  lines.push(`  ${'-'.repeat(80)}`);

  for (const peer of peers) {
    const indicator = peer.status === 'online' ? '*' : 'o';
    const shellDisplay = peer.shell || peer.platform || '?';
    const tags = store.getPeerTags(peer.id);
    const displayName = tags?.displayName ?? peer.hostname;
    const role = tags?.role ?? '-';
    lines.push(
      `  ${indicator} ${String(peer.port).padEnd(6)}${displayName.padEnd(18)}${role.padEnd(10)}${shellDisplay.padEnd(14)}${truncatePath(peer.cwd)}`,
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
