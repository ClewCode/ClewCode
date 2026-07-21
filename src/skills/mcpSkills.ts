/**
 * MCP Skills - skill content served through MCP server resources.
 *
 * Convention: an MCP server advertises resources with URIs matching
 *   skill://<name>                      - concise form
 *   (prefix)/skills/<name>.md           - hierarchical form
 *
 * The resource content is SKILL.md-format markdown (with optional frontmatter)
 * which is parsed and converted to Command objects using the same pipeline as
 * file-based skills (parseSkillFrontmatterFields + createSkillCommand).
 *
 * Imported dynamically from client.ts and useManageMCPConnections.ts
 * under the MCP_SKILLS feature flag.
 */
import {
  ListResourcesResultSchema,
  type ReadResourceResult,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { MCPServerConnection } from '../services/mcp/types.js';
import type { Command } from '../types/command.js';
import { logForDebugging } from '../utils/debug.js';
import { parseFrontmatter } from '../utils/frontmatterParser.js';
import { memoizeWithLRU } from '../utils/memoize.js';
import { getMCPSkillBuilders } from './mcpSkillBuilders.js';

const MCP_FETCH_CACHE_SIZE = 100;

/**
 * URI pattern for detecting skill resources.
 * Matches:
 *   skill://<name>
 *   (prefix)/skills/<name>.md
 */
const SKILL_URI_PATTERN = /^(?:skill:\/\/|.*\/skills\/)(.+?)(?:\.md)?$/;

/**
 * Fetches all skill resources from an MCP server and converts them to Command objects.
 *
 * Uses the MCP resources/list and resources/read protocol methods to discover
 * and load skill content. Skill resources are identified by URI convention:
 *
 *   skill://<name>              -> simple skill URI
 *   (prefix)/skills/<name>.md   -> hierarchical skill URI
 *
 * Each resource's content is parsed as SKILL.md (frontmatter + markdown body)
 * and converted to a Command using the same pipeline as file-based skills.
 *
 * The result is memoized per server name with LRU eviction (see MCP_FETCH_CACHE_SIZE).
 */
export const fetchMcpSkillsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Command[]> => {
    if (client.type !== 'connected') return [];
    if (!client.capabilities?.resources) return [];

    try {
      const result = await client.client.request({ method: 'resources/list' }, ListResourcesResultSchema);
      if (!result.resources) return [];

      // Filter to skill resources by URI convention
      const skillResources = result.resources.filter(r => SKILL_URI_PATTERN.test(r.uri));
      if (skillResources.length === 0) return [];

      // Load all skill resources in parallel
      const skills = await Promise.all(
        skillResources.map(async resource => {
          const match = resource.uri.match(SKILL_URI_PATTERN);
          if (!match) return null;
          const skillName = match[1]!;

          try {
            const readResult = (await client.client.request(
              { method: 'resources/read', params: { uri: resource.uri } },
              ReadResourceResultSchema,
            )) as ReadResourceResult;
            // Extract text content from the resource contents array
            const textContent = readResult.contents
              .filter(
                (c): c is { text: string; uri?: string; mimeType?: string } =>
                  'text' in c && typeof c.text === 'string',
              )
              .map(c => c.text)
              .join('\n\n');

            if (!textContent) return null;

            const skillCommand = buildMcpSkillCommand(client.name, skillName, textContent);
            if (!skillCommand) {
              // Log when skill fails to build to catch silent failures (BUG #5)
              logForDebugging(`[mcpSkills] Failed to build command for skill ${skillName} from ${client.name}`);
            }
            return skillCommand;
          } catch (error) {
            logForDebugging(`[mcpSkills] Failed to read skill resource ${resource.uri}: ${error}`);
            return null;
          }
        }),
      );

      return skills.filter((s): s is Command => s !== null);
    } catch (error) {
      logForDebugging(`[mcpSkills] Failed to fetch skills for ${client.name}: ${error}`);
      return [];
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
);

/**
 * Build a Command object from MCP skill resource content.
 *
 * Parses frontmatter + body from SKILL.md format, then delegates to
 * createSkillCommand from the shared skill builder pipeline (same as
 * file-based skills). Shell execution is blocked for MCP-originated
 * content (the loadedFrom === 'mcp' guard in createSkillCommand).
 */
function buildMcpSkillCommand(serverName: string, skillName: string, content: string): Command | null {
  const builders = getMCPSkillBuilders();
  const { frontmatter, content: markdownContent } = parseFrontmatter(content, `mcp://${serverName}/${skillName}`);

  const resolvedName = `mcp__${serverName.replace(/[^a-zA-Z0-9_-]/g, '_')}__${skillName}`;
  const parsed = builders.parseSkillFrontmatterFields(frontmatter, markdownContent, resolvedName);

  return builders.createSkillCommand({
    ...parsed,
    skillName: resolvedName,
    markdownContent,
    // Source is 'mcp' so shell execution is blocked
    source: 'mcp',
    baseDir: undefined,
    loadedFrom: 'mcp',
    paths: undefined,
  });
}
