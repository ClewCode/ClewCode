import ansis from 'ansis';
import figures from 'figures';
import type React from 'react';
import { useEffect } from 'react';
import {
  getAdditionalDirectoriesForClaudeMd,
  getOriginalCwd,
  setAdditionalDirectoriesForClaudeMd,
} from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Box, Text } from '../../ink.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { allWorkingDirectories } from '../../utils/permissions/filesystem.js';
import { applyPermissionUpdate, persistPermissionUpdate } from '../../utils/permissions/PermissionUpdate.js';
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js';
import { getLinkedDirs, linkProjects, normalizeRepoDir, unlinkProjects } from '../../utils/workspace/workspace.js';

function Result({ args, message, onDone }: { args: string; message: string; onDone: () => void }): React.ReactNode {
  useEffect(() => {
    const timer = setTimeout(onDone, 0);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <Box flexDirection="column">
      <Text dimColor>
        {figures.pointer} /workspace {args}
      </Text>
      <MessageResponse>
        <Text>{message}</Text>
      </MessageResponse>
    </Box>
  );
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  const raw = (args ?? '').trim();
  const [subcommand, ...rest] = raw.split(/\s+/).filter(Boolean);
  const pathArg = rest.join(' ').trim();
  const currentDir = getOriginalCwd();

  // Add a directory to the live session as a working directory, and persist it
  // so linked dirs stay accessible. Mirrors /add-dir's handleAddDirectory.
  const addWorkingDirectory = (path: string): void => {
    const workingDirs = allWorkingDirectories(context.getAppState().toolPermissionContext);
    if (workingDirs.has(path)) {
      return;
    }
    const permissionUpdate = {
      type: 'addDirectories' as const,
      directories: [path],
      destination: 'localSettings' as const,
    };
    const latest = context.getAppState();
    const updatedContext = applyPermissionUpdate(latest.toolPermissionContext, permissionUpdate);
    context.setAppState(prev => ({ ...prev, toolPermissionContext: updatedContext }));

    const currentDirs = getAdditionalDirectoriesForClaudeMd();
    if (!currentDirs.includes(path)) {
      setAdditionalDirectoriesForClaudeMd([...currentDirs, path]);
    }
    try {
      persistPermissionUpdate(permissionUpdate);
    } catch {
      // Non-fatal: the dir is still active for the session even if persistence fails.
    }
  };

  const renderList = (): string => {
    const links = getLinkedDirs(currentDir);
    const working = allWorkingDirectories(context.getAppState().toolPermissionContext);
    if (links.length === 0) {
      return `No linked projects. Use ${ansis.bold('/workspace link <path>')} to pair another repo.`;
    }
    const lines = links.map(dir => {
      const loaded = working.has(dir);
      const badge = loaded ? ansis.green('● loaded') : ansis.dim('○ not loaded');
      return `  ${figures.pointer} ${ansis.bold(dir)}  ${badge}`;
    });
    return [`Linked projects (${links.length}):`, ...lines].join('\n');
  };

  let message: string;

  switch (subcommand) {
    case undefined:
    case 'list':
      message = renderList();
      break;

    case 'link': {
      if (!pathArg) {
        message = `Provide a path: ${ansis.bold('/workspace link <path>')}`;
        break;
      }
      const result = linkProjects(currentDir, pathArg);
      if (!result.ok) {
        switch (result.reason) {
          case 'self':
            message = 'Cannot link a project to itself.';
            break;
          case 'notFound':
            message = `Path ${ansis.bold(result.target)} was not found.`;
            break;
          case 'notDirectory':
            message = `${ansis.bold(result.target)} is not a directory.`;
            break;
        }
        break;
      }
      addWorkingDirectory(result.target);
      message = result.alreadyLinked
        ? `${ansis.bold(result.target)} is already linked. Loaded it as a working directory.`
        : `Linked ${ansis.bold(result.target)} (bidirectional) and loaded it as a working directory.`;
      break;
    }

    case 'unlink': {
      if (!pathArg) {
        message = `Provide a path: ${ansis.bold('/workspace unlink <path>')}`;
        break;
      }
      const { target, wasLinked } = unlinkProjects(currentDir, pathArg);
      message = wasLinked
        ? `Unlinked ${ansis.bold(target)}. It stays a working directory this session — use ${ansis.dim('/permissions')} to remove it.`
        : `${ansis.bold(target)} was not linked.`;
      break;
    }

    case 'load': {
      const links = getLinkedDirs(currentDir);
      const working = allWorkingDirectories(context.getAppState().toolPermissionContext);
      const toAdd = links.filter(dir => !working.has(normalizeRepoDir(dir)));
      for (const dir of toAdd) {
        addWorkingDirectory(dir);
      }
      SandboxManager.refreshConfig();
      message =
        toAdd.length === 0
          ? links.length === 0
            ? 'No linked projects to load.'
            : 'All linked projects are already loaded.'
          : `Loaded ${toAdd.length} linked project${toAdd.length === 1 ? '' : 's'} as working directories.`;
      break;
    }

    default:
      message = `Unknown subcommand ${ansis.bold(subcommand)}. Use ${ansis.bold('link')}, ${ansis.bold('unlink')}, ${ansis.bold('load')}, or ${ansis.bold('list')}.`;
      break;
  }

  if (subcommand === 'link' || subcommand === 'load') {
    SandboxManager.refreshConfig();
  }

  return <Result args={raw} message={message} onDone={() => onDone(message)} />;
}
