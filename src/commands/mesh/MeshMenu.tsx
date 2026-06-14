/**
 * MeshMenu — Interactive menu for peer management.
 *
 * Shows two sections:
 * 1. Status bar (sharing status, peer count)
 * 2. Connected peers list
 * 3. Action menu (share, join, name, role, inbox)
 */

import * as React from 'react';
import { Byline } from '../../components/design-system/Byline.js';
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js';
import { Pane } from '../../components/design-system/Pane.js';
import { Box, Text, useInput } from '../../ink.js';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshServer } from '../../mesh/MeshServer.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { formatPeerLatency, formatPeerLoad, getPeerHealth, summarizePeerMesh } from '../../mesh/meshHealth.js';
import type { MeshInfo } from '../../mesh/types.js';

type View = 'main' | 'peers';

const MENU_ITEMS = [
  { id: 'share', label: 'Share / Stop share', desc: 'Toggle peer advertising' },
  { id: 'join', label: 'Join peer', desc: 'Connect to a peer by port' },
  { id: 'name', label: 'Set my name', desc: 'Set display name for yourself' },
  { id: 'role', label: 'Set my role', desc: 'Set role for yourself' },
  { id: 'discover', label: 'Discover', desc: 'Scan for available peers' },
  { id: 'inbox', label: 'Inbox', desc: 'View pending messages' },
  { id: 'peers', label: 'Peer list', desc: 'Show connected peers' },
  { id: 'close', label: 'Close', desc: 'Exit peer menu' },
];

function MeshRow({ peer, tags }: { peer: MeshInfo; tags: any }) {
  const name = tags?.displayName || peer.hostname;
  const role = tags?.role ? `[${tags.role}]` : '';
  const health = getPeerHealth(peer);
  const healthColor = health === 'healthy' ? 'ansi:green' : health === 'lagging' ? 'ansi:yellow' : 'ansi:red';
  const latency = formatPeerLatency(peer);
  const load = formatPeerLoad(peer);
  return (
    <Box flexDirection="row">
      <Text color={healthColor}>{peer.status === 'online' ? '*' : 'o'} </Text>
      <Text color={healthColor}>{name.padEnd(16)}</Text>
      <Text dimColor>{role.padEnd(12)}</Text>
      <Text color={healthColor}>{health.padEnd(9)}</Text>
      <Text dimColor>{latency.padEnd(8)}</Text>
      <Text dimColor>{load.padEnd(8)}</Text>
      <Text dimColor>
        {peer.ip}:{peer.port}
      </Text>
    </Box>
  );
}

function MeshMenu({ onDone }: { onDone: (result?: string, options?: any) => void }): React.ReactNode {
  const store = getGlobalMeshStore();
  const discovery = getGlobalDiscovery();
  const [focus, setFocus] = React.useState(0);
  const [view, setView] = React.useState<View>('main');
  const [peers, setPeers] = React.useState<MeshInfo[]>([]);
  const [isSharing, setIsSharing] = React.useState(discovery.isSharing);

  React.useEffect(() => {
    const update = () => {
      setPeers(store.getPeers());
      setIsSharing(discovery.isSharing);
    };
    update();
    const iv = setInterval(update, 3000);
    return () => clearInterval(iv);
  }, [store, discovery]);

  useInput((_key, k) => {
    if (k.escape) {
      if (view === 'peers') {
        setView('main');
        return;
      }
      onDone(undefined, { display: 'skip' });
      return;
    }

    if (view === 'peers') {
      if (k.return) {
        setView('main');
        return;
      }
      if (k.upArrow) setFocus(f => Math.max(0, f - 1));
      if (k.downArrow) setFocus(f => Math.min(peers.length - 1, f + 1));
      return;
    }

    if (k.return) {
      const item = MENU_ITEMS[focus];
      if (!item) return;
      switch (item.id) {
        case 'close':
          onDone(undefined, { display: 'skip' });
          return;
        case 'share': {
          if (isSharing) {
            discovery.stopAdvertising();
            getGlobalMeshServer().stop();
            setIsSharing(false);
          } else {
            (async () => {
              const info: MeshInfo = {
                id: discovery.meshId,
                hostname: discovery.hostname,
                ip: '127.0.0.1',
                port: 0,
                cwd: process.cwd(),
                version: '',
                lastSeen: Date.now(),
                status: 'online',
              };
              const port = await getGlobalMeshServer().start(info);
              info.port = port;
              await discovery.startAdvertising(port, process.cwd());
              setIsSharing(true);
            })();
          }
          return;
        }
        case 'join':
          onDone(undefined, { display: 'skip', nextInput: '/mesh join ', submitNextInput: false });
          return;
        case 'name':
          onDone(undefined, { display: 'skip', nextInput: '/mesh name ', submitNextInput: false });
          return;
        case 'role':
          onDone(undefined, { display: 'skip', nextInput: '/mesh role ', submitNextInput: false });
          return;
        case 'discover':
          onDone(undefined, { display: 'skip', nextInput: '/mesh discover', submitNextInput: true });
          return;
        case 'inbox':
          onDone(undefined, { display: 'skip', nextInput: '/mesh inbox', submitNextInput: true });
          return;
        case 'peers':
          setView('peers');
          setFocus(0);
          return;
      }
    }

    if (k.upArrow) setFocus(f => Math.max(0, f - 1));
    if (k.downArrow) setFocus(f => Math.min(MENU_ITEMS.length - 1, f + 1));
  });

  if (view === 'peers') {
    const mesh = summarizePeerMesh(peers);
    return (
      <Pane color="claude">
        <Box flexDirection="column">
          <Text color="remember" bold>
            LAN Mesh
          </Text>
          <Text dimColor>
            {peers.length + (isSharing ? 1 : 0)} peer(s) | {mesh.healthy} healthy | {mesh.lagging} lagging |{' '}
            {mesh.offline} offline
            {mesh.avgLatencyMs !== undefined ? ` | avg ${Math.round(mesh.avgLatencyMs)}ms` : ''}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {/* Self */}
            {isSharing && (
              <Box flexDirection="row">
                <Text color="ansi:cyan"> * </Text>
                <Text color="ansi:cyan">{store.getPeerTags(discovery.meshId)?.displayName || 'Me'.padEnd(16)}</Text>
                <Text dimColor>:{(getGlobalMeshServer().port || '?').toString().padEnd(6)}</Text>
                <Text color="ansi:cyan" dimColor>
                  (self)
                </Text>
              </Box>
            )}
            {/* Connected peers */}
            {peers.length === 0 && !isSharing ? (
              <Text dimColor italic>
                No connected peers.
              </Text>
            ) : (
              <>
                <Box flexDirection="row">
                  <Text dimColor> Name Role Health Latency Load Address</Text>
                </Box>
                {peers.map((p, i) => (
                  <Box key={p.id} flexDirection="row">
                    <Text color={i === focus ? 'suggestion' : undefined}>{i === focus ? '>' : ' '} </Text>
                    <MeshRow peer={p} tags={store.getPeerTags(p.id)} />
                  </Box>
                ))}
              </>
            )}
          </Box>
          <Box marginTop={1}>
            <Byline>
              <KeyboardShortcutHint shortcut="Esc" action="back" />
            </Byline>
          </Box>
        </Box>
      </Pane>
    );
  }

  const connCount = peers.length;
  const mesh = summarizePeerMesh(peers);

  return (
    <Pane color="claude">
      <Box flexDirection="column">
        {/* Status */}
        <Box marginBottom={1} flexDirection="column">
          <Text color="remember" bold>
            Mesh System
          </Text>
          <Text dimColor>
            {isSharing ? `:${getGlobalMeshServer().port || '?'}  ` : 'Inactive  '}
            {store.getPeerTags(discovery.meshId)?.displayName || discovery.hostname}
            {store.getPeerTags(discovery.meshId)?.role ? `  [${store.getPeerTags(discovery.meshId)!.role}]` : ''}
            <Text> | {connCount} connection(s)</Text>
          </Text>
          {connCount > 0 && (
            <Text dimColor>
              Mesh health: {mesh.healthy} healthy, {mesh.lagging} lagging, {mesh.offline} offline
              {mesh.avgLatencyMs !== undefined ? `, avg ${Math.round(mesh.avgLatencyMs)}ms` : ''}
            </Text>
          )}
        </Box>

        {/* Menu items */}
        <Box flexDirection="column" marginBottom={1}>
          {MENU_ITEMS.map((item, i) => (
            <Box key={item.id} flexDirection="row">
              <Text color={i === focus ? 'suggestion' : undefined} bold={i === focus}>
                {i === focus ? '> ' : '  '}
              </Text>
              <Text color={i === focus ? 'suggestion' : undefined}>{item.label.padEnd(20)}</Text>
              <Text dimColor>{item.desc}</Text>
            </Box>
          ))}
        </Box>

        {/* Footer */}
        <Box>
          <Byline>
            <KeyboardShortcutHint shortcut="arrows" action="navigate" />
            <KeyboardShortcutHint shortcut="Enter" action="select" />
            <KeyboardShortcutHint shortcut="Esc" action="close" />
          </Byline>
        </Box>
      </Box>
    </Pane>
  );
}

export default MeshMenu;
