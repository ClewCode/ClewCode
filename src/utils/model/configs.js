// @[MODEL LAUNCH]: Add a new CLAUDE_*_CONFIG constant here. Double check the correct model strings
// here since the pattern may change.
export const CLAUDE_3_7_SONNET_CONFIG = {
    firstParty: 'claude-3-7-sonnet-20250219',
    bedrock: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    vertex: 'claude-3-7-sonnet@20250219',
    foundry: 'claude-3-7-sonnet',
};
export const CLAUDE_3_5_V2_SONNET_CONFIG = {
    firstParty: 'claude-3-5-sonnet-20241022',
    bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    vertex: 'claude-3-5-sonnet-v2@20241022',
    foundry: 'claude-3-5-sonnet',
};
export const CLAUDE_3_5_HAIKU_CONFIG = {
    firstParty: 'claude-3-5-haiku-20241022',
    bedrock: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    vertex: 'claude-3-5-haiku@20241022',
    foundry: 'claude-3-5-haiku',
};
export const CLAUDE_HAIKU_4_5_CONFIG = {
    firstParty: 'claude-haiku-4-5-20251001',
    bedrock: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    vertex: 'claude-haiku-4-5@20251001',
    foundry: 'claude-haiku-4-5',
};
export const CLAUDE_SONNET_4_CONFIG = {
    firstParty: 'claude-sonnet-4-20250514',
    bedrock: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    vertex: 'claude-sonnet-4@20250514',
    foundry: 'claude-sonnet-4',
};
export const CLAUDE_SONNET_4_5_CONFIG = {
    firstParty: 'claude-sonnet-4-5-20250929',
    bedrock: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    vertex: 'claude-sonnet-4-5@20250929',
    foundry: 'claude-sonnet-4-5',
};
export const CLAUDE_OPUS_4_CONFIG = {
    firstParty: 'claude-opus-4-20250514',
    bedrock: 'us.anthropic.claude-opus-4-20250514-v1:0',
    vertex: 'claude-opus-4@20250514',
    foundry: 'claude-opus-4',
};
export const CLAUDE_OPUS_4_1_CONFIG = {
    firstParty: 'claude-opus-4-1-20250805',
    bedrock: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
    vertex: 'claude-opus-4-1@20250805',
    foundry: 'claude-opus-4-1',
};
export const CLAUDE_OPUS_4_5_CONFIG = {
    firstParty: 'claude-opus-4-5-20251101',
    bedrock: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
    vertex: 'claude-opus-4-5@20251101',
    foundry: 'claude-opus-4-5',
};
export const CLAUDE_OPUS_4_7_CONFIG = {
    firstParty: 'claude-opus-4-7',
    bedrock: 'us.anthropic.claude-opus-4-7-v1',
    vertex: 'claude-opus-4-7',
    foundry: 'claude-opus-4-7',
};
export const CLAUDE_SONNET_4_7_CONFIG = {
    firstParty: 'claude-sonnet-4-7',
    bedrock: 'us.anthropic.claude-sonnet-4-7',
    vertex: 'claude-sonnet-4-7',
    foundry: 'claude-sonnet-4-7',
};
// @[MODEL LAUNCH]: Register the new config here.
export const ALL_MODEL_CONFIGS = {
    haiku35: CLAUDE_3_5_HAIKU_CONFIG,
    haiku45: CLAUDE_HAIKU_4_5_CONFIG,
    sonnet35: CLAUDE_3_5_V2_SONNET_CONFIG,
    sonnet37: CLAUDE_3_7_SONNET_CONFIG,
    sonnet40: CLAUDE_SONNET_4_CONFIG,
    sonnet45: CLAUDE_SONNET_4_5_CONFIG,
    sonnet46: CLAUDE_SONNET_4_7_CONFIG,
    sonnet47: CLAUDE_SONNET_4_7_CONFIG,
    opus40: CLAUDE_OPUS_4_CONFIG,
    opus41: CLAUDE_OPUS_4_1_CONFIG,
    opus45: CLAUDE_OPUS_4_5_CONFIG,
    opus46: CLAUDE_OPUS_4_7_CONFIG,
    opus47: CLAUDE_OPUS_4_7_CONFIG,
};
/** Runtime list of canonical model IDs — used by comprehensiveness tests. */
export const CANONICAL_MODEL_IDS = Object.values(ALL_MODEL_CONFIGS).map(c => c.firstParty);
/** Map canonical ID → internal short key. Used to apply settings-based modelOverrides. */
export const CANONICAL_ID_TO_KEY = Object.fromEntries(Object.entries(ALL_MODEL_CONFIGS).map(([key, cfg]) => [cfg.firstParty, key]));
