import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  WEEKLY_EXECUTION_OPTIONS,
  WEEKLY_JOB_BUTTONS,
  WEEKLY_PLATFORM_OPTIONS,
  WEEKLY_SUITE_OPTIONS
} from './weekly-status.config';
import {
  WeeklyExecutionTypeFilter,
  WeeklyPlatformFilter,
  WeeklyStatusBoardRow,
  WeeklyStatusResponse,
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
  selector: 'app-automation-weekly-status-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './automation-weekly-status-page.component.html',
  styleUrls: ['./automation-weekly-status-page.component.css']
})
export class AutomationWeeklyStatusPageComponent implements OnInit, OnDestroy {
  readonly platformOptions = WEEKLY_PLATFORM_OPTIONS;
  readonly suiteOptions = WEEKLY_SUITE_OPTIONS;
  readonly executionOptions = WEEKLY_EXECUTION_OPTIONS;
  readonly weeklyJobs = WEEKLY_JOB_BUTTONS;

  private refreshHandle?: ReturnType<typeof setInterval>;

  selectedWeekInput = '';
  filterPlatform: WeeklyPlatformFilter = 'ALL';
  filterSuite: WeeklySuiteFilter = 'ALL';
  filterExecutionType: WeeklyExecutionTypeFilter = 'ALL';

  board: WeeklyStatusResponse | null = null;
  loading = false;
  runningAllJobs = false;
  runningJobId: string | null = null;
  exporting = false;
  error = '';
  info = '';

  constructor(
    private weeklyStatus: WeeklyStatusService,
    private location: Location,
    private router: Router
  ) {
    const range = getWorkingWeekRangeFromInput();
    this.selectedWeekInput = range.weekStart;
  }

  ngOnInit(): void {
    this.loadBoard();
    this.refreshHandle = setInterval(() => {
      if (this.hasActiveRuns()) {
        this.loadBoard(false);
      }
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
    }
  }

  get rows(): WeeklyStatusBoardRow[] {
    return this.board?.rows || [];
  }

  get boardLabel(): string {
    return this.board?.label || getWorkingWeekRangeFromInput(this.selectedWeekInput).label;
  }

  get summary() {
    return (
      this.board?.summary || {
        totalAutomated: 0,
        passed: 0,
        failed: 0,
        passRate: 0
      }
    );
  }

  onWeekChange(value: string): void {
    const range = getWorkingWeekRangeFromInput(value);
    this.selectedWeekInput = range.weekStart;
    this.loadBoard();
  }

  refresh(): void {
    this.loadBoard();
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/');
  }

  runWeeklyJobs(): void {
    const range = getWorkingWeekRangeFromInput(this.selectedWeekInput);
    this.runningAllJobs = true;
    this.error = '';
    this.info = '';

    this.weeklyStatus
      .runWeeklyJobs(range.weekStart, range.weekEnd)
      .pipe(finalize(() => (this.runningAllJobs = false)))
      .subscribe({
        next: () => {
          this.info = `Triggered weekly jobs for ${range.label}.`;
          this.loadBoard(false);
        },
        error: err => {
          this.error = friendlyWeeklyStatusError(err, 'Unable to trigger weekly jobs.');
        }
      });
  }

  runWeeklyJob(jobId: string, label: string): void {
    const range = getWorkingWeekRangeFromInput(this.selectedWeekInput);
    this.runningJobId = jobId;
    this.error = '';
    this.info = '';

    this.weeklyStatus
      .runWeeklyJob(jobId, range.weekStart, range.weekEnd)
      .pipe(finalize(() => (this.runningJobId = null)))
      .subscribe({
        next: () => {
          this.info = `Triggered ${label} for ${range.label}.`;
          this.loadBoard(false);
        },
        error: err => {
          this.error = friendlyWeeklyStatusError(err, `Unable to trigger ${label}.`);
        }
      });
  }

  exportBoard(): void {
    const filter = this.currentFilter();
    this.exporting = true;
    this.error = '';

    this.weeklyStatus
      .exportWeeklyStatus(filter)
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: blob => {
          const filename = `automation-weekly-status-${filter.weekStart}-to-${filter.weekEnd}.csv`;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
        },
        error: err => {
          this.error = friendlyWeeklyStatusError(err, 'Unable to export the weekly board.');
        }
      });
  }

  formatPercent(value?: number | null): string {
    return formatPercent(value);
  }

  badgeClass(status?: string): string {
    return statusBadgeClass(status);
  }

  isRunningJob(jobId: string): boolean {
    return this.runningJobId === jobId;
  }

  trackByRow(_index: number, row: WeeklyStatusBoardRow): string {
    return row.id;
  }

  private currentFilter() {
    const range = getWorkingWeekRangeFromInput(this.selectedWeekInput);
    return {
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      platform: this.filterPlatform,
      suite: this.filterSuite,
      executionType: this.filterExecutionType
    };
  }

  private hasActiveRuns(): boolean {
    return this.rows.some(row => ['QUEUED', 'RUNNING'].includes(String(row.jobStatus || '').toUpperCase()));
  }

  private loadBoard(showLoader = true): void {
    const filter = this.currentFilter();
    if (showLoader) {
      this.loading = true;
    }
    this.error = '';

    this.weeklyStatus
      .getWeeklyStatus(filter)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: response => {
          this.board = response;
        },
        error: err => {
          this.error = friendlyWeeklyStatusError(err, 'Unable to load the weekly status board.');
        }
      });
  }
}
