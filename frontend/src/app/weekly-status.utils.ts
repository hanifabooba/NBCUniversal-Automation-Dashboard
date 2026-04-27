import {
  AutomationKpiMetrics,
  AutomationKpiResponse,
  KpiMetricCard,
  PlatformSnapshot,
  WeeklyStatusBoardRow,
  WeeklyStatusResponse,
  WeeklyStatusSummary,
  WorkingWeekRange
} from './weekly-status.models';

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(monday: Date, friday: Date): string {
  const sameYear = monday.getFullYear() === friday.getFullYear();
  const sameMonth = sameYear && monday.getMonth() === friday.getMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monday);
    return `${month} ${monday.getDate()} - ${friday.getDate()}, ${monday.getFullYear()}`;
  }

  if (sameYear) {
    const start = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(monday);
    const end = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(friday);
    return `${start} - ${end}, ${monday.getFullYear()}`;
  }

  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt.format(monday)} - ${fmt.format(friday)}`;
}

export function getWorkingWeekRange(inputDate: Date): WorkingWeekRange {
  const date = new Date(inputDate);
  const day = date.getDay();
  const normalized = new Date(date);

  if (day === 6) {
    normalized.setDate(date.getDate() - 1);
  } else if (day === 0) {
    normalized.setDate(date.getDate() - 2);
  }

  const currentDay = normalized.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(normalized);
  monday.setDate(normalized.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return {
    monday,
    friday,
    weekStart: formatDateOnly(monday),
    weekEnd: formatDateOnly(friday),
    label: formatWeekLabel(monday, friday)
  };
}

export function getWorkingWeekRangeFromInput(value?: string): WorkingWeekRange {
  if (value) {
    const parsed = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return getWorkingWeekRange(parsed);
    }
  }
  return getWorkingWeekRange(new Date());
}

export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

function extractMessageFromRawBody(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as { message?: string; error?: string };
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Keep falling through to plain-text and HTML checks.
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.startsWith('<!doctype') || normalized.startsWith('<html')) {
    return 'This data is temporarily unavailable. Please refresh and try again in a moment.';
  }

  return trimmed;
}

export function friendlyWeeklyStatusError(err: any, fallback: string): string {
  const backendMessage = typeof err?.error?.message === 'string' ? err.error.message.trim() : '';
  if (backendMessage) {
    return backendMessage;
  }

  const rawBody = typeof err?.error === 'string' ? err.error.trim() : '';
  if (rawBody) {
    const extracted = extractMessageFromRawBody(rawBody);
    if (extracted) {
      return extracted;
    }
  }

  const rawMessage = typeof err?.message === 'string' ? err.message.trim() : '';
  if (
    rawMessage.includes('Http failure during parsing') ||
    rawMessage.includes('unexpected response') ||
    rawMessage.includes('invalid JSON')
  ) {
    return 'This data is temporarily unavailable. Please refresh and try again in a moment.';
  }

  const status = Number(err?.status ?? 0);
  if (status === 0) {
    return 'We could not reach the service right now. Please check your connection and try again.';
  }
  if (status >= 500) {
    return 'This data is temporarily unavailable. Please try again shortly.';
  }

  return fallback;
}

function emptyAutomationKpiMetrics(): AutomationKpiMetrics {
  return {
    healthIndex: 0,
    passRate: 0,
    averageCoverage: 0,
    executionCompletion: 0,
    successRatio: 0,
    totalSuites: 0,
    executedSuites: 0,
    successfulSuites: 0,
    failedSuites: 0,
    activeSuites: 0,
    pendingSuites: 0,
    totalAutomated: 0,
    totalPassed: 0,
    totalFailed: 0
  };
}

function buildAutomationKpiMetricsFromBoard(summary: WeeklyStatusSummary, rows: WeeklyStatusBoardRow[]): AutomationKpiMetrics {
  if (!rows.length) {
    return emptyAutomationKpiMetrics();
  }

  const executedRows = rows.filter(row => String(row.jobStatus || '').toUpperCase() !== 'NOT_RUN');
  const completedRows = rows.filter(row => ['SUCCESS', 'FAILED'].includes(String(row.jobStatus || '').toUpperCase()));
  const successfulRows = rows.filter(row => String(row.jobStatus || '').toUpperCase() === 'SUCCESS');
  const failedRows = rows.filter(row => String(row.jobStatus || '').toUpperCase() === 'FAILED');
  const activeRows = rows.filter(row => ['QUEUED', 'RUNNING'].includes(String(row.jobStatus || '').toUpperCase()));
  const pendingRows = rows.filter(row => String(row.jobStatus || '').toUpperCase() === 'NOT_RUN');
  const averageCoverage = rows.reduce((total, row) => total + Number(row.coveragePercent || 0), 0) / rows.length;
  const executionCompletion = rows.length ? (executedRows.length / rows.length) * 100 : 0;
  const successRatio = completedRows.length ? (successfulRows.length / completedRows.length) * 100 : 0;
  const passRate = Number(summary.passRate || 0);
  const healthIndex = Math.round(
    Math.min(
      100,
      passRate * 0.45 +
        averageCoverage * 0.25 +
        executionCompletion * 0.2 +
        successRatio * 0.1
    )
  );

  return {
    healthIndex,
    passRate,
    averageCoverage,
    executionCompletion,
    successRatio,
    totalSuites: rows.length,
    executedSuites: executedRows.length,
    successfulSuites: successfulRows.length,
    failedSuites: failedRows.length,
    activeSuites: activeRows.length,
    pendingSuites: pendingRows.length,
    totalAutomated: Number(summary.totalAutomated || 0),
    totalPassed: Number(summary.passed || 0),
    totalFailed: Number(summary.failed || 0)
  };
}

function buildKpiMetricTrend(
  current: number,
  previous: number,
  options: { unit: string; positiveIsHigher: boolean }
): Pick<KpiMetricCard, 'trend' | 'trendTone'> {
  if (!Number.isFinite(previous) || previous === 0) {
    return {
      trend: 'Baseline unavailable from previous week',
      trendTone: 'neutral'
    };
  }

  const delta = current - previous;
  if (Math.abs(delta) < 0.05) {
    return {
      trend: 'Flat versus previous week',
      trendTone: 'neutral'
    };
  }

  const directionUp = delta > 0;
  const better = options.positiveIsHigher ? directionUp : !directionUp;
  const arrow = directionUp ? 'Up' : 'Down';
  return {
    trend: `${arrow} ${Math.abs(delta).toFixed(1)}${options.unit} versus previous week`,
    trendTone: better ? 'positive' : 'negative'
  };
}

function buildAutomationKpiMetricCards(current: AutomationKpiMetrics, previous: AutomationKpiMetrics): KpiMetricCard[] {
  return [
    {
      label: 'Health index',
      value: `${current.healthIndex}/100`,
      detail: 'Weighted from pass rate, script coverage, execution completion, and successful suite closes.',
      ...buildKpiMetricTrend(current.healthIndex, previous.healthIndex, {
        unit: ' pts',
        positiveIsHigher: true
      })
    },
    {
      label: 'Weekly pass rate',
      value: `${current.passRate.toFixed(1)}%`,
      detail: `${current.totalPassed} passed vs ${current.totalFailed} failed in the selected scope.`,
      ...buildKpiMetricTrend(current.passRate, previous.passRate, {
        unit: '%',
        positiveIsHigher: true
      })
    },
    {
      label: 'Execution completion',
      value: `${current.executedSuites}/${current.totalSuites}`,
      detail: `${current.executionCompletion.toFixed(0)}% of suites produced a signal this week.`,
      ...buildKpiMetricTrend(current.executionCompletion, previous.executionCompletion, {
        unit: '%',
        positiveIsHigher: true
      })
    },
    {
      label: 'Average coverage',
      value: `${current.averageCoverage.toFixed(1)}%`,
      detail: `${current.totalAutomated} automated scripts are represented in the current board mix.`,
      ...buildKpiMetricTrend(current.averageCoverage, previous.averageCoverage, {
        unit: '%',
        positiveIsHigher: true
      })
    }
  ];
}

function buildAutomationKpiPlatformSnapshots(rows: WeeklyStatusBoardRow[]): PlatformSnapshot[] {
  const grouped = new Map<string, WeeklyStatusBoardRow[]>();
  for (const row of rows) {
    const key = row.platform || 'Unknown';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)?.push(row);
  }

  return Array.from(grouped.entries())
    .map(([platform, platformRows]) => {
      const executed = platformRows.filter(row => String(row.jobStatus || '').toUpperCase() !== 'NOT_RUN');
      const failed = platformRows.filter(row => String(row.jobStatus || '').toUpperCase() === 'FAILED');
      const passRate = executed.length
        ? executed.reduce((total, row) => total + Number(row.passingRate || 0), 0) / executed.length
        : 0;
      const coverage =
        platformRows.reduce((total, row) => total + Number(row.coveragePercent || 0), 0) / platformRows.length;

      return {
        platform,
        suites: platformRows.length,
        executedSuites: executed.length,
        failedSuites: failed.length,
        passRate,
        coverage
      };
    })
    .sort((left, right) => right.passRate - left.passRate);
}

function buildAutomationKpiStrengthRows(rows: WeeklyStatusBoardRow[]): WeeklyStatusBoardRow[] {
  return [...rows]
    .filter(row => String(row.jobStatus || '').toUpperCase() === 'SUCCESS' || Number(row.passed || 0) > 0)
    .sort((left, right) => {
      const passDiff = Number(right.passingRate || 0) - Number(left.passingRate || 0);
      if (passDiff !== 0) return passDiff;
      const coverageDiff = Number(right.coveragePercent || 0) - Number(left.coveragePercent || 0);
      if (coverageDiff !== 0) return coverageDiff;
      return Number(right.passed || 0) - Number(left.passed || 0);
    })
    .slice(0, 3);
}

function buildAutomationKpiWatchlistRows(rows: WeeklyStatusBoardRow[]): WeeklyStatusBoardRow[] {
  const riskScore = (row: WeeklyStatusBoardRow) => {
    const status = String(row.jobStatus || '').toUpperCase();
    const statusPenalty =
      status === 'FAILED' ? 70 : status === 'RUNNING' ? 35 : status === 'QUEUED' ? 28 : status === 'NOT_RUN' ? 18 : 0;
    const passPenalty = status === 'NOT_RUN' ? 12 : Math.max(0, 100 - Number(row.passingRate || 0));
    const failurePenalty = Number(row.failed || 0) * 2.5;
    const coveragePenalty = Math.max(0, 65 - Number(row.coveragePercent || 0)) * 0.35;
    return statusPenalty + passPenalty + failurePenalty + coveragePenalty;
  };

  return [...rows]
    .filter(row => riskScore(row) > 0)
    .sort((left, right) => riskScore(right) - riskScore(left))
    .slice(0, 4);
}

function findAutomationKpiLastUpdatedLabel(rows: WeeklyStatusBoardRow[]): string {
  const timestamps = rows
    .map(row => row.executedAt)
    .filter((value): value is string => !!value)
    .map(value => new Date(value))
    .filter(value => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  if (!timestamps.length) {
    return 'Awaiting first execution';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamps[0]);
}

function buildAutomationKpiPostureLabel(metrics: AutomationKpiMetrics): string {
  const { healthIndex, failedSuites, activeSuites } = metrics;
  if (activeSuites > 0) return 'Live movement';
  if (failedSuites > 0 && healthIndex < 70) return 'Needs recovery';
  if (healthIndex >= 85) return 'Release-ready';
  if (healthIndex >= 70) return 'Stable with watch items';
  if (healthIndex >= 55) return 'Watch closely';
  return 'At risk';
}

function buildAutomationKpiPostureCopy(metrics: AutomationKpiMetrics): string {
  const { failedSuites, activeSuites, pendingSuites, successfulSuites } = metrics;
  if (activeSuites > 0) {
    return `${activeSuites} suite${activeSuites === 1 ? '' : 's'} still ${activeSuites === 1 ? 'is' : 'are'} in flight. Keep this board open until the signal settles.`;
  }
  if (failedSuites > 0) {
    return `${failedSuites} suite${failedSuites === 1 ? '' : 's'} failed in the selected window. Release confidence is constrained until the watchlist items are cleared.`;
  }
  if (pendingSuites > 0) {
    return `${successfulSuites} suite${successfulSuites === 1 ? '' : 's'} completed cleanly, but ${pendingSuites} still ${pendingSuites === 1 ? 'has' : 'have'} no signal for the week.`;
  }
  return 'The current automation mix is healthy across pass rate, coverage, and suite completion. This is the best single-screen readiness view we can produce with today’s data.';
}

export function buildAutomationKpiResponseFromWeeklyBoards(
  currentBoard: WeeklyStatusResponse,
  previousBoard: WeeklyStatusResponse
): AutomationKpiResponse {
  const currentMetrics = buildAutomationKpiMetricsFromBoard(currentBoard.summary, currentBoard.rows);
  const previousMetrics = buildAutomationKpiMetricsFromBoard(previousBoard.summary, previousBoard.rows);

  return {
    weekStart: currentBoard.weekStart,
    weekEnd: currentBoard.weekEnd,
    label: currentBoard.label,
    currentMetrics,
    previousMetrics,
    metricCards: buildAutomationKpiMetricCards(currentMetrics, previousMetrics),
    platformSnapshots: buildAutomationKpiPlatformSnapshots(currentBoard.rows),
    strengths: buildAutomationKpiStrengthRows(currentBoard.rows),
    watchlist: buildAutomationKpiWatchlistRows(currentBoard.rows),
    lastUpdatedLabel: findAutomationKpiLastUpdatedLabel(currentBoard.rows),
    postureLabel: buildAutomationKpiPostureLabel(currentMetrics),
    postureCopy: buildAutomationKpiPostureCopy(currentMetrics),
    hasActiveRuns: currentBoard.rows.some(row => ['QUEUED', 'RUNNING'].includes(String(row.jobStatus || '').toUpperCase()))
  };
}

export function statusBadgeClass(status?: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'text-bg-success';
    case 'FAILED':
      return 'text-bg-danger';
    case 'RUNNING':
      return 'text-bg-info';
    case 'QUEUED':
      return 'text-bg-secondary';
    default:
      return 'text-bg-light text-dark';
  }
}
