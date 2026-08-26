import { normalize } from 'path';

export type FileLease = {
  filePath: string;
  agentId: string;
  acquiredAt: number;
  description?: string;
};

export type LeaseAcquisitionResult = { success: true; lease: FileLease } | { success: false; conflictWith: FileLease };

class FileLeaseManager {
  private activeLeases = new Map<string, FileLease>();

  /**
   * Attempt to acquire an exclusive write lease on a file path for a given agent.
   */
  acquire(filePath: string, agentId: string, description?: string): LeaseAcquisitionResult {
    const key = normalize(filePath);
    const existing = this.activeLeases.get(key);

    if (existing && existing.agentId !== agentId) {
      return {
        success: false,
        conflictWith: existing,
      };
    }

    const lease: FileLease = {
      filePath: key,
      agentId,
      acquiredAt: Date.now(),
      description,
    };

    this.activeLeases.set(key, lease);
    return { success: true, lease };
  }

  /**
   * Release a specific file write lease held by an agent.
   */
  release(filePath: string, agentId: string): boolean {
    const key = normalize(filePath);
    const existing = this.activeLeases.get(key);
    if (existing && existing.agentId === agentId) {
      this.activeLeases.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Release all leases held by an agent (e.g. when task completes or is killed).
   */
  releaseAllForAgent(agentId: string): number {
    let releasedCount = 0;
    for (const [key, lease] of this.activeLeases.entries()) {
      if (lease.agentId === agentId) {
        this.activeLeases.delete(key);
        releasedCount++;
      }
    }
    return releasedCount;
  }

  /**
   * Check if a file path is currently leased by any agent.
   */
  getLease(filePath: string): FileLease | undefined {
    return this.activeLeases.get(normalize(filePath));
  }

  /**
   * Clear all active leases (useful for session resets / testing).
   */
  clear(): void {
    this.activeLeases.clear();
  }
}

export const globalFileLeaseManager = new FileLeaseManager();

export function acquireFileWriteLease(filePath: string, agentId: string, description?: string): LeaseAcquisitionResult {
  return globalFileLeaseManager.acquire(filePath, agentId, description);
}

export function releaseFileWriteLease(filePath: string, agentId: string): boolean {
  return globalFileLeaseManager.release(filePath, agentId);
}

export function releaseAllAgentLeases(agentId: string): number {
  return globalFileLeaseManager.releaseAllForAgent(agentId);
}

export function getActiveFileLease(filePath: string): FileLease | undefined {
  return globalFileLeaseManager.getLease(filePath);
}
