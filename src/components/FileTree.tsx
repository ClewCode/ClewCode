import * as React from 'react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from '../ink.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import { join, relative, basename } from 'path';
import { getCwd } from '../utils/cwd.js';
import chalk from 'chalk';
import chokidar from 'chokidar';

export interface FileNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: FileNode[];
  level: number;
}

interface FileTreeProps {
  onFileSelect?: (path: string) => void;
  width?: number;
  isFocused?: boolean;
}

export function FileTree({ onFileSelect, width = 30, isFocused = true }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([getCwd()]));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const fs = getFsImplementation();

  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Real-time updates using chokidar
  useEffect(() => {
    const watcher = chokidar.watch(getCwd(), {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.claude/cache/**'
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 3 // Watch up to 3 levels deep for responsiveness
    });

    watcher.on('add', refresh);
    watcher.on('unlink', refresh);
    watcher.on('addDir', refresh);
    watcher.on('unlinkDir', refresh);

    return () => {
      void watcher.close();
    };
  }, [refresh]);

  // Recursively build the tree nodes for rendering as a flat list
  const buildFlatTree = useMemo(() => {
    const flatNodes: FileNode[] = [];
    
    function walk(dirPath: string, level: number) {
      try {
        const entries = fs.readdirSync(dirPath);
        // Sort: directories first, then files
        const sortedEntries = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const entry of sortedEntries) {
          const fullPath = join(dirPath, entry.name);
          // Skip hidden files/folders (except .claude if we want, but let's stick to standard)
          if (entry.name.startsWith('.') && entry.name !== '.claude') continue;
          
          const node: FileNode = {
            path: fullPath,
            name: entry.name,
            isDirectory: entry.isDirectory(),
            level
          };
          
          flatNodes.push(node);
          
          if (node.isDirectory && expandedFolders.has(fullPath)) {
            walk(fullPath, level + 1);
          }
        }
      } catch (e) {
        // Ignore errors (e.g. permission denied)
      }
    }

    walk(getCwd(), 0);
    return flatNodes;
  }, [expandedFolders, fs, refreshKey]);

  useEffect(() => {
    setNodes(buildFlatTree);
  }, [buildFlatTree]);

  useInput((input, key) => {
    if (!isFocused) return;
    
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(nodes.length - 1, prev + 1));
    } else if (key.rightArrow || key.return) {
      const node = nodes[selectedIndex];
      if (node?.isDirectory) {
        setExpandedFolders(prev => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });
      } else if (node && onFileSelect) {
        onFileSelect(node.path);
      }
    } else if (key.leftArrow) {
      const node = nodes[selectedIndex];
      if (node?.isDirectory && expandedFolders.has(node.path)) {
        setExpandedFolders(prev => {
          const next = new Set(prev);
          next.delete(node.path);
          return next;
        });
      }
    }
  });

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderRight={true} borderLeft={false} borderTop={false} borderBottom={false} borderColor="dim">
      <Box paddingX={1} borderStyle="single" borderColor="dim" borderBottom={true} borderLeft={false} borderRight={false} borderTop={false}>
        <Text bold color={isFocused ? 'cyan' : 'dim'}>📁 EXPLORER {isFocused ? '' : '(Ctrl+B to focus)'}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {nodes.map((node, index) => {
          const isSelected = index === selectedIndex;
          const isExpanded = node.isDirectory && expandedFolders.has(node.path);
          const icon = node.isDirectory ? (isExpanded ? '▼ 📁' : '▶ 📁') : '  📄';
          const padding = '  '.repeat(node.level);
          
          return (
            <Box key={node.path}>
              <Text 
                backgroundColor={isSelected ? 'white' : undefined} 
                color={isSelected ? 'black' : (node.isDirectory ? 'blue' : undefined)}
                wrap="truncate-end"
              >
                {padding}{icon} {node.name}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1} paddingX={1} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor="dim">
        <Text dimColor>↑↓ Move • Enter Open</Text>
      </Box>
    </Box>
  );
}
