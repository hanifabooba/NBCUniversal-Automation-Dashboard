import { CommonModule, Location } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import {
  WEEKLY_EXECUTION_OPTIONS,
  WEEKLY_PLATFORM_OPTIONS,
  WEEKLY_SUITE_OPTIONS
} from './weekly-status.config';
import {
  AutomationKpiMetrics,
  KpiMetricCard,
  PlatformSnapshot,
  WeeklyExecutionTypeFilter,
  WeeklyPlatformFilter,
  WeeklyStatusBoardRow,
  WeeklyStatusFilter,
  WeeklySuiteFilter
} from './weekly-status.models';
import { WeeklyStatusService } from './weekly-status.service';
import {
  friendlyWeeklyStatusError,
  formatPercent,
  getWorkingWeekRangeFromInput,
  statusBadgeClass
} from './weekly-status.utils';

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
  private hasActiveKpiRuns = false;

  selectedWeekInput = '';
  filterPlatform: WeeklyPlatformFilter = 'ALL';
  filterSuite: WeeklySuiteFilter = 'ALL';
  filterExecutionType: WeeklyExecutionTypeFilter = 'ALL';

  boardLabel = getWorkingWeekRangeFromInput().label;
  postureLabel = 'Awaiting signal';
  postureCopy = 'KPI data will appear here once the backend returns weekly board metrics.';
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
    this.boardLabel = range.label;
  }

  ngOnInit(): void {
    this.loadKpis();
    this.refreshHandle = setInterval(() => {
      if (this.hasActiveKpiRuns) {
        this.loadKpis(false);
      }
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
    }
  }

  get heroDialStyle(): string {
    const score = Math.max(0, Math.min(100, this.currentMetrics.healthIndex));
    return `conic-gradient(var(--kpi-accent) 0% ${score}%, rgba(255, 255, 255, 0.16) ${score}% 100%)`;
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
    const filter = this.currentFilter();
    if (showLoader) {
      this.loading = true;
    }
    this.error = '';

    this.weeklyStatus
      .getAutomationKpi(filter)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: payload => {
          this.boardLabel = payload.label;
          this.postureLabel = payload.postureLabel;
          this.postureCopy = payload.postureCopy;
          this.currentMetrics = payload.currentMetrics;
          this.previousMetrics = payload.previousMetrics;
          this.metricCards = payload.metricCards || [];
          this.platformSnapshots = payload.platformSnapshots || [];
          this.strengths = payload.strengths || [];
          this.watchlist = payload.watchlist || [];
          this.lastUpdatedLabel = payload.lastUpdatedLabel || 'Awaiting first execution';
          this.hasActiveKpiRuns = !!payload.hasActiveRuns;
        },
        error: err => {
          this.hasActiveKpiRuns = false;
          this.error = friendlyWeeklyStatusError(err, 'Unable to load automation KPI data.');
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
}
