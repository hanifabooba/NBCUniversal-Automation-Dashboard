import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EnvHealthService, EnvRun } from './env-health.service';

@Component({
  standalone: true,
  selector: 'app-product-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.css']
})
export class ProductListComponent implements OnInit {
  runs: EnvRun[] = [];
  loading = false;
  error: string | null = null;
  selectedDay = 'all';
  openIds = new Set<string>();

  days: string[] = ['all'];

  constructor(private envHealth: EnvHealthService) {}

  ngOnInit(): void {
    this.fetchRuns();
  }

  get visibleRuns(): EnvRun[] {
    return this.filteredRuns();
  }

  get totalSnapshots(): number {
    return this.visibleRuns.length;
  }

  get latestRun(): EnvRun | null {
    return this.visibleRuns[0] || null;
  }

  get aggregateCounts() {
    return this.visibleRuns.reduce(
      (summary, run) => {
        const counts = this.statusCounts(run);
        summary.pass += counts.pass;
        summary.warn += counts.warn;
        summary.fail += counts.fail;
        return summary;
      },
      { pass: 0, warn: 0, fail: 0 }
    );
  }

  get selectedDayLabel(): string {
    if (this.selectedDay === 'all') return 'All snapshots';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${this.selectedDay}T12:00:00`));
  }

  fetchRuns(): void {
    this.loading = true;
    this.error = null;
    this.envHealth.list().subscribe({
      next: data => {
        this.runs = data || [];
        this.refreshDays();
        // Start with all collapsed by default
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to load environment health. Try again later.';
      }
    });
  }

  syncNow(): void {
    this.loading = true;
    this.error = null;
    this.envHealth.sync().subscribe({
      next: run => {
        this.runs = [run, ...this.runs].slice(0, 50);
        this.refreshDays();
        this.expandLatest();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Sync failed. Check Jenkins connectivity.';
      }
    });
  }

  refreshDays(): void {
    const unique = Array.from(new Set(this.runs.map(r => this.dayKey(r.fetchedAt))));
    this.days = ['all', ...unique.sort((a, b) => (a < b ? 1 : -1))];
    if (!this.days.includes(this.selectedDay)) {
      this.selectedDay = this.days.find(d => d !== 'all') || 'all';
    }
  }

  filteredRuns(): EnvRun[] {
    const runs = [...this.runs].sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime());
    return this.selectedDay === 'all' ? runs : runs.filter(r => this.dayKey(r.fetchedAt) === this.selectedDay);
  }

  statusCounts(run: EnvRun) {
    const summary = { pass: 0, warn: 0, fail: 0 };
    run.checks?.forEach(c => {
      const st = c.status?.toUpperCase();
      if (st === 'PASS') summary.pass++;
      else if (st === 'WARNING' || st === 'WARN') summary.warn++;
      else summary.fail++;
    });
    return summary;
  }

  latestStatusLabel(run: EnvRun): string {
    const counts = this.statusCounts(run);
    if (counts.fail > 0) return 'Needs attention';
    if (counts.warn > 0) return 'Watch closely';
    return 'Healthy';
  }

  statusBadgeClass(status: string | null | undefined): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'PASS') return 'bg-success-subtle text-success-emphasis';
    if (normalized === 'WARNING' || normalized === 'WARN') return 'bg-warning-subtle text-warning-emphasis';
    return 'bg-danger-subtle text-danger-emphasis';
  }

  toggle(run: EnvRun): void {
    if (this.openIds.has(run.id)) {
      this.openIds.delete(run.id);
    } else {
      this.openIds.add(run.id);
    }
  }

  isOpen(run: EnvRun): boolean {
    return this.openIds.has(run.id);
  }

  private expandLatest(): void {
    const latest = [...this.runs].sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())[0];
    if (latest) {
      this.openIds.add(latest.id);
      this.selectedDay = this.dayKey(latest.fetchedAt);
    }
  }

  private dayKey(date: string): string {
    return date ? date.split('T')[0] : 'unknown';
  }
}
