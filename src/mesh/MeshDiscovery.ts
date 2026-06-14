/**
 * MeshDiscovery — Cross-shell + LAN mesh discovery
 *
 * Two mechanisms:
 * 1. **File-based** (same machine): each instance writes a JSON file to
 *    os.tmpdir()/clew-peers/{pid}.json so other shells can discover it.
 * 2. **UDP multicast** (different machines): broadcast on LAN for remote peers.
 *
 * Usage:
 *   startAdvertising(port, cwd)  — write peer file + start UDP beacon
 *   stopAdvertising()            — remove peer file + send UDP goodbye
 *   discoverPeers()              — scan peer files + send UDP query
 */

import type * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import {
  type DiscoveryMessage,
  MESH_DISCOVERY_PORT,
  MESH_HEARTBEAT_INTERVAL,
  MESH_MULTICAST_GROUP,
  MESH_STALE_TIMEOUT,
  type MeshInfo,
} from './types.js';

/** Peer registry dir — use home dir for consistency across terminals */
const MESH_DIR = path.join(os.homedir(), '.clew', 'peers');

interface SwarmFile {
  pid: number;
  id: string;
  hostname: string;
  ip: string;
  port: number;
  cwd: string;
  shell: string;
  platform: string;
  term: string;
  startedAt: number;
  sessionId?: string;
}

export type MeshDiscoveryCallbacks = {
  onPeerDiscovered?: (peer: MeshInfo) => void;
  onPeerLost?: (meshId: string) => void;
};

export class MeshDiscovery {
  private socket: dgram.Socket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<string, MeshInfo>();
  private callbacks: MeshDiscoveryCallbacks;
  private isAdvertising = false;

  /** Unique peer ID per instance (hostname-ip-pid) */
  private localId = '';
  private localHostname = '';
  private localIp = '';
  private localPort = 0;
  /** Our PID — used for file name and unique ID */
  private pid = 0;

  constructor(callbacks?: MeshDiscoveryCallbacks) {
    this.callbacks = callbacks ?? {};
    this.localHostname = os.hostname();
    this.pid = process.pid;

    // Pick best non-internal IPv4 prioritizing real network adapters over virtual ones
    const ifaces = os.networkInterfaces();
    let bestIp = '';
    let bestScore = -999;

    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      const lowerName = name.toLowerCase();

      // Base score for interface name matching
      let baseScore = 0;
      if (
        lowerName.includes('wi-fi') ||
        lowerName.includes('wifi') ||
        lowerName.includes('wlan') ||
        lowerName.includes('wireless')
      ) {
        baseScore += 10;
      } else if (lowerName.includes('ethernet') || lowerName.includes('lan')) {
        baseScore += 5;
      }

      // Penalize virtual interfaces
      if (
        lowerName.includes('virtual') ||
        lowerName.includes('vbox') ||
        lowerName.includes('virtualbox') ||
        lowerName.includes('vmware') ||
        lowerName.includes('vethernet') ||
        lowerName.includes('tailscale') ||
        lowerName.includes('zerotier') ||
        lowerName.includes('host-only') ||
        lowerName.includes('pseudo') ||
        lowerName.includes('loopback')
      ) {
        baseScore -= 20;
      }

      for (const addr of addrs) {
        if (addr.family !== 'IPv4') continue;

        let score = baseScore;

        if (addr.internal) {
          score -= 50;
        } else {
          score += 1;
        }

        // Check MAC vendor prefixes (OUI)
        const mac = addr.mac.toLowerCase();
        if (
          mac.startsWith('08:00:27') ||
          mac.startsWith('0a:00:27') || // VirtualBox
          mac.startsWith('00:05:69') ||
          mac.startsWith('00:0c:29') ||
          mac.startsWith('00:1c:14') ||
          mac.startsWith('00:50:56') || // VMware
          mac.startsWith('00:15:5d') // Hyper-V
        ) {
          score -= 20;
        }

        // Link-local address
        if (addr.address.startsWith('169.254.')) {
          score -= 30;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIp = addr.address;
        }
      }
    }

    this.localIp = bestIp || '127.0.0.1';
    // Unique per instance: include PID
    this.localId = `${this.localHostname}-${this.localIp}-${this.pid}`;
  }

  setLocalName(name: string): void {
    this.localHostname = name;
    this.localId = `${name}-${this.localIp}-${this.pid}`;
    // Re-write peer file with new name so other instances see it
    const myFile = path.join(MESH_DIR, `${this.pid}.json`);
    try {
      if (fs.existsSync(myFile)) {
        const data = JSON.parse(fs.readFileSync(myFile, 'utf-8'));
        data.hostname = name;
        data.id = this.localId;
        fs.writeFileSync(myFile, JSON.stringify(data, null, 2));
      }
    } catch {
      /* best-effort */
    }
    // Also update MeshServer's stored info so /mesh-info returns the new name
    import('./MeshServer.js')
      .then(({ getGlobalMeshServer }) => {
        getGlobalMeshServer().updatePeerInfo({ hostname: name, id: this.localId });
      })
      .catch(() => {
        /* peer server not yet started */
      });
  }

  // ── Shell detection ──────────────────────────────────────

  private detectShell(): string {
    // Try SHELL env (Unix/macOS/Git Bash)
    const sh = process.env.SHELL;
    if (sh) {
      // Handle both Unix (/) and Windows (\) paths
      const sep = sh.includes('\\') ? '\\' : '/';
      const parts = sh.split(sep);
      const name = parts[parts.length - 1] ?? sh;
      return name.replace(/\.exe$/i, '');
    }
    // Windows: check ComSpec and PSModulePath
    if (process.env.PSModulePath) return 'powershell';
    if (process.env.ComSpec) {
      const cs = process.env.ComSpec.toLowerCase();
      if (cs.includes('powershell')) return 'powershell';
      if (cs.includes('bash')) return 'bash';
      return 'cmd';
    }
    return 'unknown';
  }

  private get platformName(): string {
    return process.platform;
  }

  private get termName(): string {
    return process.env.TERM || (process.platform === 'win32' ? 'windows-terminal' : 'unknown');
  }

  // ── File-based peer registry (same machine) ──────────────

  /**
   * Write our peer file to temp dir so other instances see us.
   */
  private writePeerFile(cwd: string, sessionId?: string): void {
    try {
      fs.mkdirSync(MESH_DIR, { recursive: true });
      const data: SwarmFile = {
        pid: this.pid,
        id: this.localId,
        hostname: this.localHostname,
        ip: '127.0.0.1',
        port: this.localPort,
        cwd,
        shell: this.detectShell(),
        platform: this.platformName,
        term: this.termName,
        startedAt: Date.now(),
        sessionId,
      };
      fs.writeFileSync(path.join(MESH_DIR, `${this.pid}.json`), JSON.stringify(data, null, 2));
    } catch {
      /* best-effort */
    }
  }

  /**
   * Remove our peer file so others stop seeing us.
   */
  private removePeerFile(): void {
    try {
      fs.unlinkSync(path.join(MESH_DIR, `${this.pid}.json`));
    } catch {
      /* best-effort */
    }
  }

  /**
   * Scan the temp dir for other instances' peer files.
   */
  private scanPeerFiles(): MeshInfo[] {
    const result: MeshInfo[] = [];
    try {
      const dir = fs.readdirSync(MESH_DIR, { withFileTypes: true });
      const now = Date.now();
      for (const entry of dir) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const filePath = path.join(MESH_DIR, entry.name);
        try {
          const stat = fs.statSync(filePath);
          // Auto-evict stale peer files
          if (now - stat.mtimeMs > MESH_STALE_TIMEOUT) {
            try {
              fs.unlinkSync(filePath);
            } catch {
              /* ignore */
            }
            continue;
          }

          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SwarmFile;
          result.push({
            id: data.id,
            hostname: data.hostname,
            ip: data.ip,
            port: data.port,
            cwd: data.cwd,
            sessionId: data.sessionId,
            version: '',
            shell: data.shell,
            platform: data.platform,
            term: data.term,
            lastSeen: stat.mtimeMs,
            status: 'online',
          });
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // MESH_DIR doesn't exist yet — no peers
    }
    return result;
  }

  /**
   * Clean up stale peer files from dead instances.
   */
  private cleanupPeerFiles(): void {
    try {
      const dir = fs.readdirSync(MESH_DIR, { withFileTypes: true });
      const now = Date.now();
      for (const entry of dir) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        try {
          const stat = fs.statSync(path.join(MESH_DIR, entry.name));
          // Remove files older than MESH_STALE_TIMEOUT
          if (now - stat.mtimeMs > MESH_STALE_TIMEOUT) {
            fs.unlinkSync(path.join(MESH_DIR, entry.name));
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* MESH_DIR doesn't exist */
    }
  }

  // ── UDP socket (LAN) ─────────────────────────────────────

  private async ensureSocket(): Promise<dgram.Socket | null> {
    return null; // Disabled UDP Multicast for localhost-only safety
  }

  private sendUdpMessage(msg: object, targetPort = MESH_DISCOVERY_PORT, targetAddress = MESH_MULTICAST_GROUP): void {
    if (!this.socket) return;
    try {
      this.socket.send(Buffer.from(JSON.stringify(msg)), targetPort, targetAddress);
    } catch {
      /* best-effort */
    }
  }

  // ── Public API ───────────────────────────────────────────

  async startAdvertising(myPort: number, cwd: string, sessionId?: string, version?: string): Promise<void> {
    if (this.isAdvertising) return;

    try {
      this.localPort = myPort;
      this.isAdvertising = true;

      // Write peer file (same-machine discovery)
      this.writePeerFile(cwd, sessionId);

      // Start UDP (LAN discovery) — best-effort
      try {
        await this.ensureSocket();
      } catch {
        logForDebugging('[MeshDiscovery] UDP unavailable');
      }

      const heartbeat = () => {
        // Keep peer file fresh (same machine)
        this.writePeerFile(cwd, sessionId);
        // Send UDP beacon (different machines)
        this.sendBeacon(cwd, sessionId, version);
      };

      heartbeat();
      this.heartbeatTimer = setInterval(heartbeat, MESH_HEARTBEAT_INTERVAL);

      // Cleanup timer
      this.cleanupTimer = setInterval(() => this.cleanupStalePeers(), MESH_HEARTBEAT_INTERVAL);

      logForDebugging(`[MeshDiscovery] Advertising (pid=${this.pid}, port=${myPort})`);
    } catch (err) {
      logForDebugging(`[MeshDiscovery] Failed to start: ${errorMessage(err)}`);
    }
  }

  stopAdvertising(): void {
    if (!this.isAdvertising) return;
    this.isAdvertising = false;

    // Remove peer file
    this.removePeerFile();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    try {
      this.sendUdpMessage({
        type: 'clew-peer-info',
        version: 1,
        id: this.localId,
        hostname: this.localHostname,
        ip: this.localIp,
        port: this.localPort,
        cwd: '',
        appVersion: '',
        shell: this.detectShell(),
        platform: this.platformName,
        term: this.termName,
        status: 'offline',
      });
    } catch {
      /* best-effort */
    }

    logForDebugging('[MeshDiscovery] Stopped');
  }

  async discoverMeshs(timeout = 3000): Promise<MeshInfo[]> {
    return this.discoverPeers(timeout);
  }

  async discoverPeers(timeout = 3000): Promise<MeshInfo[]> {
    try {
      // 1. Scan peer files (same machine)
      const filePeers = this.scanPeerFiles();
      for (const peer of filePeers) {
        this.peers.set(peer.id, peer);
      }

      // 2. Send UDP query (LAN) — best-effort
      try {
        await this.ensureSocket();
        this.sendUdpMessage({ type: 'clew-peer-query', version: 1 });
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, timeout);
          timer.unref();
          // Responses add to this.peers via handleMessage
        });
      } catch {
        // UDP not available
      }

      // 3. Add ourselves if we have a peer file (regardless of advertising flag)
      const myFile = path.join(MESH_DIR, `${this.pid}.json`);
      try {
        if (fs.existsSync(myFile)) {
          const data = JSON.parse(fs.readFileSync(myFile, 'utf-8')) as SwarmFile;
          this.peers.set(this.localId, {
            id: data.id,
            hostname: data.hostname,
            ip: data.ip,
            port: data.port,
            cwd: data.cwd,
            sessionId: data.sessionId,
            version: '',
            shell: data.shell,
            platform: data.platform,
            term: data.term,
            lastSeen: Date.now(),
            status: 'online',
          });
        }
      } catch {
        // No peer file — still try advertising flag
        if (this.isAdvertising && this.localPort) {
          this.peers.set(this.localId, {
            id: this.localId,
            hostname: this.localHostname,
            ip: this.localIp,
            port: this.localPort,
            cwd: process.cwd(),
            version: '',
            shell: this.detectShell(),
            platform: this.platformName,
            term: this.termName,
            lastSeen: Date.now(),
            status: 'online',
          });
        }
      }

      logForDebugging(`[MeshDiscovery] Found ${this.peers.size} peer(s)`);
    } catch (err) {
      logForDebugging(`[MeshDiscovery] Error: ${errorMessage(err)}`);
    }

    return Array.from(this.peers.values());
  }

  getPeers(): MeshInfo[] {
    return Array.from(this.peers.values());
  }

  getPeer(id: string): MeshInfo | undefined {
    return this.peers.get(id);
  }

  close(): void {
    this.stopAdvertising();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  get isSharing(): boolean {
    return this.isAdvertising;
  }

  get meshId(): string {
    return this.localId;
  }

  get hostname(): string {
    return this.localHostname;
  }

  // ── UDP message handling ─────────────────────────────────

  private sendBeacon(cwd: string, sessionId?: string, version?: string): void {
    if (!this.isAdvertising) return;
    this.sendUdpMessage({
      type: 'clew-peer-info',
      version: 1,
      id: this.localId,
      hostname: this.localHostname,
      ip: this.localIp,
      port: this.localPort,
      cwd: cwd || '',
      sessionId,
      appVersion: version || '',
      shell: this.detectShell(),
      platform: this.platformName,
      term: this.termName,
      status: 'online',
    });
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString()) as DiscoveryMessage;

      switch (data.type) {
        case 'clew-peer-query':
          if (this.isAdvertising && this.localPort) {
            this.sendUdpMessage(
              {
                type: 'clew-peer-info',
                version: 1,
                id: this.localId,
                hostname: this.localHostname,
                ip: this.localIp,
                port: this.localPort,
                cwd: process.cwd(),
                appVersion: '',
                shell: this.detectShell(),
                platform: this.platformName,
                term: this.termName,
                status: 'online',
              },
              rinfo.port,
              rinfo.address,
            );
          }
          break;

        case 'clew-peer-info': {
          if (data.id === this.localId) break;
          const peer: MeshInfo = {
            id: data.id,
            hostname: data.hostname,
            ip: data.ip,
            port: data.port,
            cwd: data.cwd,
            sessionId: data.sessionId,
            version: data.appVersion ?? '',
            shell: data.shell,
            platform: data.platform,
            term: data.term,
            lastSeen: Date.now(),
            status: data.status,
          };
          if (data.status === 'offline') {
            this.peers.delete(data.id);
            this.callbacks.onPeerLost?.(data.id);
          } else {
            const isNew = !this.peers.has(data.id);
            this.peers.set(data.id, peer);
            if (isNew) {
              this.callbacks.onPeerDiscovered?.(peer);
            }
          }
          break;
        }
      }
    } catch {
      /* ignore malformed */
    }
  }

  private cleanupStalePeers(): void {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > MESH_STALE_TIMEOUT) {
        this.peers.delete(id);
        this.callbacks.onPeerLost?.(id);
      }
    }
    // Also clean up dead peer files
    this.cleanupPeerFiles();
  }
}

/** Singleton */
let globalDiscovery: MeshDiscovery | null = null;

export function getGlobalDiscovery(): MeshDiscovery {
  if (!globalDiscovery) {
    globalDiscovery = new MeshDiscovery();
  }
  return globalDiscovery;
}
