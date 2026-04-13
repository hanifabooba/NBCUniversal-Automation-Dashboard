import { CommonModule, Location } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import {
  WEEKLY_EXECUTION_OPTIONS,
  WEEKLY_PLATFORM_OPTIONS,
  WEEKLY_SUITE_OPTIONS
} from './weekly-status.config';
import {
  WeeklyExecutionTypeFilter,
  WeeklyPlatformFilter,
  WeeklyStatusBoardRow,
  WeeklyStatusFilter,
  WeeklyStatusResponse,
  WeeklySuiteFilter
} from './weekly-status.models';
import { WeeklyStatusService } from './weekly-status.service';
import { formatPercent, getWorkingWeekRange, getWorkingWeekRangeFromInput, statusBadgeClass } from './weekly-status.utils';

interface AutomationKpiMetrics {
  healthIndex: number;
  passRate: number;
  averageCoverage: number;
  executionCompletion: number;
  successRatio: number;
  totalSuites: number;
  executedSuites: number;
  successfulSuites: number;
  failedSuites: number;
  activeSuites: number;
  pendingSuites: number;
  totalAutomated: number;
  totalPassed: number;
  totalFailed: number;
}

interface KpiMetricCard {
  label: string;
  value: string;
  detail: string;
  trend: string;
  trendTone: 'positive' | 'negative' | 'neutral';
}

interface PlatformSnapshot {
  platform: string;
  suites: number;
  executedSuites: number;
  failedSuites: number;
  passRate: number;
  coverage: number;
}

@Component({
  standalone: true,
  selector: 'app-automation-kpi-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './automation-kpi-page.component.html',
  styleUrls: ['./automation-kpi-page.component.css']
})
export class AutomationKpiPageComponent implements OnInit, OnDestroy {
  readonly platformOptions = WEEKLY_PLATFORM_OPTIONS;
  readonly suiteOptions = WEEKLY_SUITE_OPTIONS;
  readonly executionOptions = WEEKLY_EXECUTION_OPTIONS;

  private refreshHandle?: ReturnType<typeof setInterval>;

  selectedWeekInput = '';
  filterPlatform: WeeklyPlatformFilter = 'ALL';
  filterSuite: WeeklySuiteFilter = 'ALL';
  filterExecutionType: WeeklyExecutionTypeFilter = 'ALL';

  currentBoard: WeeklyStatusResponse | null = null;
  previousBoard: WeeklyStatusResponse | null = null;
  currentMetrics = this.emptyMetrics();
  previousMetrics = this.emptyMetrics();
  metricCards: KpiMetricCard[] = [];
  platformSnapshots: PlatformSnapshot[] = [];
  strengths: WeeklyStatusBoardRow[] = [];
  watchlist: WeeklyStatusBoardRow[] = [];
  loading = false;
  error = '';
  lastUpdatedLabel = 'Awaiting first execution';

  constructor(
    private weeklyStatus: WeeklyStatusService,
    private location: Location,
    private router: Router
  ) {
    const range = getWorkingWeekRangeFromInput();
    this.selectedWeekInput = range.weekStart;
  }

  ngOnInit(): void {
    this.loadKpis();
    this.refreshHandle = setInterval(() => {
      if (this.hasActiveRuns()) {
        this.loadKpis(false);
      }
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
    }
  }

  get boardLabel(): string {
    return this.currentBoard?.label || getWorkingWeekRangeFromInput(this.selectedWeekInput).label;
  }

  get postureLabel(): string {
    const { healthIndex, failedSuites, activeSuites } = this.currentMetrics;
    if (activeSuites > 0) return 'Live movement';
    if (failedSuites > 0 && healthIndex < 70) return 'Needs recovery';
    if (healthIndex >= 85) return 'Release-ready';
    if (healthIndex >= 70) return 'Stable with watch items';
    if (healthIndex >= 55) return 'Watch closely';
    return 'At risk';
  }

  get postureCopy(): string {
    const { failedSuites, activeSuites, pendingSuites, successfulSuites } = this.currentMetrics;
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

  get heroDialStyle(): string {
    const score = Math.max(0, Math.min(100, this.currentMetrics.healthIndex));
    return `conic-gradient(var(--kpi-accent) 0% ${score}%, rgba(255, 255, 255, 0.16) ${score}% 100%)`;
  }

  get strongestRow(): WeeklyStatusBoardRow | null {
    return this.strengths[0] || null;
  }

  get riskiestRow(): WeeklyStatusBoardRow | null {
    return this.watchlist[0] || null;
  }

  onWeekChange(value: string): void {
    const range = getWorkingWeekRangeFromInput(value);
    this.selectedWeekInput = range.weekStart;
    this.loadKpis();
  }

  refresh(): void {
    this.loadKpis();
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/dashboard');
  }

  badgeClass(status?: string): string {
    return statusBadgeClass(status);
  }

  formatPercent(value?: number | null): string {
    return formatPercent(value);
  }

  private loadKpis(showLoader = true): void {
    const currentFilter = this.currentFilter();
    const previousFilter = this.previousFilter(currentFilter);
    if (showLoader) {
      this.loading = true;
    }
    this.error = '';

    forkJoin({
      current: this.weeklyStatus.getWeeklyStatus(currentFilter),
      previous: this.weeklyStatus.getWeeklyStatus(previousFilter)
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ current, previous }) => {
          this.currentBoard = current;
          this.previousBoard = previous;
          this.currentMetrics = this.buildMetrics(current);
          this.previousMetrics = this.buildMetrics(previous);
          this.metricCards = this.buildMetricCards(this.currentMetrics, this.previousMetrics);
          this.platformSnapshots = this.buildPlatformSnapshots(current.rows || []);
          this.strengths = this.buildStrengthRows(current.rows || []);
          this.watchlist = this.buildWatchlistRows(current.rows || []);
          this.lastUpdatedLabel = this.findLastUpdatedLabel(current.rows || []);
        },
        error: err => {
          this.error = err?.error?.message || err?.message || 'Unable to load automation KPI data.';
        }
      });
  }

  private currentFilter(): WeeklyStatusFilter {
    const range = getWorkingWeekRangeFromInput(this.selectedWeekInput);
    return {
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      platform: this.filterPlatform,
      suite: this.filterSuite,
      executionType: this.filterExecutionType
    };
  }

  private previousFilter(filter: WeeklyStatusFilter): WeeklyStatusFilter {
    const currentWeek = new Date(`${filter.weekStart}T12:00:00`);
    const previousWeek = new Date(currentWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);
    const range = getWorkingWeekRange(previousWeek);

    return {
      ...filter,
      weekStart: range.weekStart,
      weekEnd: range.weekEnd
    };
  }

  private hasActiveRuns(): boolean {
    return (this.currentBoard?.rows || []).some(row => ['QUEUED', 'RUNNING'].includes(String(row.jobStatus || '').toUpperCase()));
  }

  private emptyMetrics(): AutomationKpiMetrics {
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

  private buildMetrics(board: WeeklyStatusResponse | null): AutomationKpiMetrics {
    const rows = board?.rows || [];
    if (!rows.length) {
      return this.emptyMetrics();
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
    const passRate = Number(board?.summary?.passRate || 0);
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
      totalAutomated: Number(board?.summary?.totalAutomated || 0),
      totalPassed: Number(board?.summary?.passed || 0),
      totalFailed: Number(board?.summary?.failed || 0)
    };
  }

  private buildMetricCards(current: AutomationKpiMetrics, previous: AutomationKpiMetrics): KpiMetricCard[] {
    return [
      {
        label: 'Health index',
        value: `${current.healthIndex}/100`,
        detail: 'Weighted from pass rate, script coverage, execution completion, and successful suite closes.',
        ...this.metricTrend(current.healthIndex, previous.healthIndex, {
          unit: ' pts',
          positiveIsHigher: true
        })
      },
      {
        label: 'Weekly pass rate',
        value: `${current.passRate.toFixed(1)}%`,
        detail: `${current.totalPassed} passed vs ${current.totalFailed} failed in the selected scope.`,
        ...this.metricTrend(current.passRate, previous.passRate, {
          unit: '%',
          positiveIsHigher: true
        })
      },
      {
        label: 'Execution completion',
        value: `${current.executedSuites}/${current.totalSuites}`,
        detail: `${current.executionCompletion.toFixed(0)}% of suites produced a signal this week.`,
        ...this.metricTrend(current.executionCompletion, previous.executionCompletion, {
          unit: '%',
          positiveIsHigher: true
        })
      },
      {
        label: 'Average coverage',
        value: `${current.averageCoverage.toFixed(1)}%`,
        detail: `${current.totalAutomated} automated scripts are represented in the current board mix.`,
        ...this.metricTrend(current.averageCoverage, previous.averageCoverage, {
          unit: '%',
          positiveIsHigher: true
        })
      }
    ];
  }

  private metricTrend(
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

  private buildPlatformSnapshots(rows: WeeklyStatusBoardRow[]): PlatformSnapshot[] {
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

  private buildStrengthRows(rows: WeeklyStatusBoardRow[]): WeeklyStatusBoardRow[] {
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

  private buildWatchlistRows(rows: WeeklyStatusBoardRow[]): WeeklyStatusBoardRow[] {
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

  private findLastUpdatedLabel(rows: WeeklyStatusBoardRow[]): string {
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
}
