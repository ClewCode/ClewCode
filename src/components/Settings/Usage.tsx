import * as React from 'react';
import { useEffect, useState } from 'react';
import { usageCredits as extraUsageCommand } from 'src/commands/usage-credits/index.js';
import { formatCost } from 'src/cost-tracker.js';
import { getClaudeAIOAuthTokens, getSubscriptionType } from 'src/utils/auth.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { fetchCodexUtilization } from '../../services/api/codexUsage.js';
import {
  type LocalContributionGroup,
  type LocalUsageAnalytics,
  loadLocalUsageAnalytics,
} from '../../services/localUsageAnalytics.js';
import {
  type ContributingFactor,
  type ExtraUsage,
  fetchClaudeWebUsage,
  fetchUtilization,
  getClaudeSessionKey,
  type RateLimit,
  type Utilization,
} from '../../services/api/usage.js';
import { formatDuration, formatNumber, formatResetText } from '../../utils/format.js';
import { logError } from '../../utils/log.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { Byline } from '../design-system/Byline.js';
import { ProgressBar } from '../design-system/ProgressBar.js';
import { isEligibleForOverageCreditGrant, OverageCreditUpsell } from '../LogoV2/OverageCreditUpsell.js';

type LimitBarProps = {
  title: string;
  limit: RateLimit;
  maxWidth: number;
  showTimeInReset?: boolean;
  extraSubtext?: string;
};

function LimitBar({ title, limit, maxWidth, showTimeInReset = true, extraSubtext }: LimitBarProps): React.ReactNode {
  const { utilization, resets_at } = limit;
  if (utilization === null) {
    return null;
  }

  // Calculate usage percentage
  const usedText = `${Math.floor(utilization)}% used`;

  let subtext: string | undefined;
  if (resets_at) {
    subtext = `Resets ${formatResetText(resets_at, true, showTimeInReset)}`;
  }

  if (extraSubtext) {
    if (subtext) {
      subtext = `${extraSubtext} · ${subtext}`;
    } else {
      subtext = extraSubtext;
    }
  }

  const maxBarWidth = 50;
  const usedLabelSpace = 12;
  if (maxWidth >= maxBarWidth + usedLabelSpace) {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Box flexDirection="row" gap={1}>
          <ProgressBar
            ratio={utilization / 100}
            width={maxBarWidth}
            fillColor="rate_limit_fill"
            emptyColor="rate_limit_empty"
          />
          <Text>{usedText}</Text>
        </Box>
        {subtext && <Text dimColor>{subtext}</Text>}
      </Box>
    );
  } else {
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{title}</Text>
          {subtext && (
            <>
              <Text> </Text>
              <Text dimColor>· {subtext}</Text>
            </>
          )}
        </Text>
        <ProgressBar
          ratio={utilization / 100}
          width={maxWidth}
          fillColor="rate_limit_fill"
          emptyColor="rate_limit_empty"
        />
        <Text>{usedText}</Text>
      </Box>
    );
  }
}

type SessionInfoSectionProps = {
  analytics: LocalUsageAnalytics;
};

function SessionInfoSection({ analytics }: SessionInfoSectionProps): React.ReactNode {
  const session = analytics.session;
  if (!session) return null;

  const totalInput = Object.values(analytics.models).reduce((sum, m) => sum + m.inputTokens, 0);
  const totalOutput = Object.values(analytics.models).reduce((sum, m) => sum + m.outputTokens, 0);
  const totalCacheRead = Object.values(analytics.models).reduce((sum, m) => sum + m.cacheReadInputTokens, 0);
  const totalCacheCreation = Object.values(analytics.models).reduce((sum, m) => sum + m.cacheCreationInputTokens, 0);

  type Row = { label: string; value: string };
  const rows: Row[] = [
    { label: 'Total cost', value: `$${session.costUSD.toFixed(4)}` },
    { label: 'Total duration (API)', value: formatDuration(session.apiDurationMs) },
    { label: 'Total duration (wall)', value: formatDuration(session.wallDurationMs) },
    {
      label: 'Total code changes',
      value: `${session.linesAdded} lines added, ${session.linesRemoved} lines removed`,
    },
  ];

  if (totalInput > 0 || totalOutput > 0) {
    const parts = [`${formatNumber(totalInput)} input`, `${formatNumber(totalOutput)} output`];
    if (totalCacheRead > 0) parts.push(`${formatNumber(totalCacheRead)} cache read`);
    if (totalCacheCreation > 0) parts.push(`${formatNumber(totalCacheCreation)} cache write`);
    rows.push({ label: 'Usage', value: parts.join(', ') });
  }

  const labelWidth = Math.max(...rows.map(r => r.label.length));

  return (
    <Box flexDirection="column">
      <Text bold>Session</Text>
      {rows.map(row => (
        <Box key={row.label} flexDirection="row">
          <Box width={labelWidth + 2}>
            <Text dimColor>{row.label}:</Text>
          </Box>
          <Text>{row.value}</Text>
        </Box>
      ))}
    </Box>
  );
}

type LocalContributingFactorsSectionProps = {
  analytics: LocalUsageAnalytics;
};

function LocalContributingFactorsSection({ analytics }: LocalContributingFactorsSectionProps): React.ReactNode {
  const { contributionGroups, cacheMissPercentage, highContextPercentage } = analytics;
  const hasAnyContent = contributionGroups.length > 0 || cacheMissPercentage != null || highContextPercentage != null;
  if (!hasAnyContent) return null;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>What's contributing to your limits usage?</Text>
      {contributionGroups.length > 0 && (
        <>
          <Text dimColor>
            Approximate, based on local sessions on this machine — does not include other devices or claude.ai
          </Text>
          <Text dimColor>Last 24h · these are independent characteristics of your usage, not a breakdown</Text>
        </>
      )}

      {cacheMissPercentage != null && cacheMissPercentage > 0 && (
        <Box flexDirection="column">
          <Text>{cacheMissPercentage}% of your usage hit a &gt;100k-token cache miss</Text>
          <Text dimColor>
            Uncached input is expensive, and often happens when sending a message to a session that has gone idle.
            /compact before stepping away keeps the cold-start small.
          </Text>
        </Box>
      )}

      {highContextPercentage != null && highContextPercentage > 0 && (
        <Box flexDirection="column">
          <Text>{highContextPercentage}% of your usage was at &gt;150k context</Text>
          <Text dimColor>
            Longer sessions are more expensive even when cached. /compact mid-task, /clear when switching to new tasks.
          </Text>
        </Box>
      )}

      {contributionGroups.map(group => (
        <ContributionGroupBlock key={group.title} group={group} />
      ))}
    </Box>
  );
}

type ContributionGroupBlockProps = {
  group: LocalContributionGroup;
};

function ContributionGroupBlock({ group }: ContributionGroupBlockProps): React.ReactNode {
  if (group.entries.length === 0) return null;
  const nameWidth = 30;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text bold>{group.title}</Text>
        <Text> </Text>
        <Text dimColor>% of usage</Text>
      </Box>
      {group.entries.map(entry => (
        <Box key={entry.name} flexDirection="row" gap={2}>
          <Box width={nameWidth}>
            <Text>{entry.name.length > nameWidth ? `${entry.name.slice(0, nameWidth - 1)}…` : entry.name}</Text>
          </Box>
          <Text dimColor>{entry.percentage}%</Text>
        </Box>
      ))}
    </Box>
  );
}

export function Usage(): React.ReactNode {
  const [utilization, setUtilization] = useState<Utilization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { columns } = useTerminalSize();

  const availableWidth = columns - 2; // 2 for screen padding
  const maxWidth = Math.min(availableWidth, 80);

  // Session-scoped: show usage for whichever provider is active. Codex/ChatGPT
  // subscription usage is captured off live traffic (see codexUsage.ts).
  const activeProvider = ProviderManager.getInstance().getActiveProviderName();
  const isCodex = activeProvider === 'chatgpt';
  // When we have Claude OAuth credentials we can fetch limit data even if the
  // active LLM provider is different (e.g. DeepSeek). The limit bars are
  // annotated to show which account they belong to.
  const claudeTokens = getClaudeAIOAuthTokens();
  const hasClaudeCredentials = claudeTokens?.scopes?.includes('user:inference') ?? false;
  const hasUsageCredentials = isCodex || hasClaudeCredentials;

  /** Try the Web API sessionKey fallback. Returns true if data was set. */
  const tryWebFallback = React.useCallback(async (): Promise<boolean> => {
    if (isCodex) return false;
    const webData = await fetchClaudeWebUsage();
    if (webData) {
      setUtilization(webData);
      return true;
    }
    return false;
  }, [isCodex]);

  const loadUtilization = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let data: Utilization | null | undefined;
      if (isCodex) {
        data = await fetchCodexUtilization();
      } else if (hasClaudeCredentials) {
        data = (await fetchUtilization()) ?? {};
      } else {
        data = {};
      }

      // OAuth returned empty — try Web API fallback if we have a session key.
      if (!isCodex && data && !data.five_hour && !data.seven_day && getClaudeSessionKey()) {
        const usedFallback = await tryWebFallback();
        if (usedFallback) return;
      }

      setUtilization(data);
    } catch (err) {
      logError(err as Error);

      // OAuth failed — try Web API fallback before showing an error.
      if (!isCodex) {
        const usedFallback = await tryWebFallback();
        if (usedFallback) return;
      }

      const e = err as {
        status?: number;
        statusCode?: number;
        retryAfterSeconds?: number | null;
        response?: { status?: number; data?: unknown; headers?: { get?: (name: string) => string | null } };
      };
      const status = e.status ?? e.statusCode ?? e.response?.status;
      if (status === 429) {
        // The usage endpoint is strictly rate-limited per account; surface the
        // retry window instead of a generic failure.
        const retryAfter = e.retryAfterSeconds ?? Number(e.response?.headers?.get?.('retry-after'));
        const mins =
          Number.isFinite(retryAfter) && (retryAfter as number) > 0 ? Math.ceil((retryAfter as number) / 60) : null;
        setError(
          mins
            ? `Usage data is rate-limited. Try again in ~${mins} min.`
            : 'Usage data is rate-limited. Try again later.',
        );
      } else {
        const responseBody = e.response?.data ? jsonStringify(e.response.data) : undefined;
        setError(responseBody ? `Failed to load usage data: ${responseBody}` : 'Failed to load usage data');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isCodex, hasClaudeCredentials, tryWebFallback]);

  useEffect(() => {
    void loadUtilization();
  }, [loadUtilization]);

  const [localAnalytics, setLocalAnalytics] = useState<LocalUsageAnalytics | null>(null);

  useEffect(() => {
    loadLocalUsageAnalytics()
      .then(setLocalAnalytics)
      .catch(() => {});
  }, []);

  useKeybinding(
    'settings:retry',
    () => {
      void loadUtilization();
    },
    { context: 'Settings', isActive: !!error && !isLoading },
  );

  // Compute limits regardless of whether we render them yet, so
  const subscriptionType = getSubscriptionType();
  const showSonnetBar =
    !isCodex && (subscriptionType === 'max' || subscriptionType === 'team' || subscriptionType === null);

  const knownSevenDayKeys = new Set(['seven_day', 'seven_day_sonnet', 'seven_day_opus', 'seven_day_oauth_apps']);

  const limits = [
    {
      title: isCodex ? 'Current session (5h)' : 'Current session',
      limit: utilization?.five_hour ?? null,
    },
    {
      title: isCodex ? 'Current week' : 'Current week (all models)',
      limit: utilization?.seven_day ?? null,
    },
    ...(showSonnetBar
      ? [
          {
            title: 'Current week (Sonnet only)',
            limit: utilization?.seven_day_sonnet ?? null,
          },
        ]
      : []),
    // Dynamically render any extra seven_day_* limits the API returns
    // (e.g. seven_day_fable, seven_day_opus) that aren't in our known list.
    ...(utilization
      ? Object.entries(utilization as Record<string, unknown>)
          .filter(([key]) => key.startsWith('seven_day_') && !knownSevenDayKeys.has(key))
          .map(([key, value]) => ({
            title: `Current week (${key.replace('seven_day_', '').replace(/_/g, ' ')})`,
            limit: value as RateLimit | null | undefined,
          }))
      : []),
  ];

  return (
    <Box flexDirection="column" gap={1} width="100%">
      {/* Session stats — always show when available */}
      {localAnalytics?.session && <SessionInfoSection analytics={localAnalytics} />}

      {/* Error state */}
      {error && (
        <Box flexDirection="column" gap={1}>
          <Text color="error">Error: {error}</Text>
          <Text dimColor>
            <Byline>
              <ConfigurableShortcutHint action="settings:retry" context="Settings" fallback="r" description="retry" />
              <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="cancel" />
            </Byline>
          </Text>
        </Box>
      )}

      {/* Loading state (only when no error) */}
      {!error && !utilization && <Text dimColor>Loading usage data…</Text>}

      {/* Provider fallback message when no limits */}
      {utilization &&
        !limits.some(({ limit }) => limit) &&
        (hasUsageCredentials ? (
          getClaudeSessionKey() ? (
            <Text dimColor>/usage is only available for subscription plans.</Text>
          ) : (
            <Text dimColor>
              Usage limits aren't available. Run /usage-cookie &lt;sessionKey&gt; to enable Web API fallback (get
              sessionKey from claude.ai DevTools → Cookies).
            </Text>
          )
        ) : (
          <Text dimColor>Usage limits aren't available for this provider.</Text>
        ))}

      {/* Limit bars */}
      {limits.map(
        ({ title, limit }) => limit && <LimitBar key={title} title={title} limit={limit} maxWidth={maxWidth} />,
      )}

      {utilization?.extra_usage && <ExtraUsageSection extraUsage={utilization.extra_usage} maxWidth={maxWidth} />}

      {/* Local contributing factors — always show when available */}
      {localAnalytics && <LocalContributingFactorsSection analytics={localAnalytics} />}

      {/* Upstream contributing factors (fallback when no local data) */}
      {!localAnalytics && utilization?.contributing_factors && utilization.contributing_factors.length > 0 && (
        <ContributingFactorsSection factors={utilization.contributing_factors} maxWidth={maxWidth} />
      )}

      {isEligibleForOverageCreditGrant() && <OverageCreditUpsell maxWidth={maxWidth} />}

      <Text dimColor>
        <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="cancel" />
      </Text>
    </Box>
  );
}

type ExtraUsageSectionProps = {
  extraUsage: ExtraUsage;
  maxWidth: number;
};

const EXTRA_USAGE_SECTION_TITLE = 'Usage credits';

function ExtraUsageSection({ extraUsage, maxWidth }: ExtraUsageSectionProps): React.ReactNode {
  const subscriptionType = getSubscriptionType();
  const isProOrMax = subscriptionType === 'pro' || subscriptionType === 'max';
  if (!isProOrMax) {
    // Only show to Pro and Max, consistent with claude.ai non-admin usage settings
    return false;
  }

  if (!extraUsage.is_enabled) {
    if (extraUsageCommand.isEnabled()) {
      return (
        <Box flexDirection="column">
          <Text bold>{EXTRA_USAGE_SECTION_TITLE}</Text>
          <Text dimColor>Usage credits not enabled · /usage-credits to enable</Text>
        </Box>
      );
    }

    return null;
  }

  if (extraUsage.monthly_limit === null) {
    return (
      <Box flexDirection="column">
        <Text bold>{EXTRA_USAGE_SECTION_TITLE}</Text>
        <Text dimColor>Unlimited</Text>
      </Box>
    );
  }

  if (typeof extraUsage.used_credits !== 'number' || typeof extraUsage.utilization !== 'number') {
    return null;
  }

  const formattedUsedCredits = formatCost(extraUsage.used_credits / 100, 2);
  const formattedMonthlyLimit = formatCost(extraUsage.monthly_limit / 100, 2);
  const now = new Date();
  const oneMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <LimitBar
      title={EXTRA_USAGE_SECTION_TITLE}
      limit={{
        utilization: extraUsage.utilization,
        // Not applicable for enterprises, but for now we don't render this for them
        resets_at: oneMonthReset.toISOString(),
      }}
      showTimeInReset={false}
      extraSubtext={`${formattedUsedCredits} / ${formattedMonthlyLimit} spent`}
      maxWidth={maxWidth}
    />
  );
}

type ContributingFactorsSectionProps = {
  factors: ContributingFactor[];
  maxWidth: number;
};

function ContributingFactorsSection({ factors }: ContributingFactorsSectionProps): React.ReactNode {
  if (factors.length === 0) return null;

  return (
    <Box flexDirection="column">
      <Text bold>What's contributing to your limits usage</Text>
      <Box flexDirection="column" paddingLeft={2}>
        {factors.map((factor, index) => (
          <Box key={index} flexDirection="row" gap={1}>
            {factor.percentage != null && (
              <Text dimColor width={5}>
                {Math.round(factor.percentage)}%
              </Text>
            )}
            <Text wrap="wrap">{factor.reason}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
