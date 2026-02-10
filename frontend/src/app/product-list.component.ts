import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EnvHealthService, EnvRun } from './env-health.service';

@Component({
  standalone: true,
  selector: 'app-product-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './product-list.component.html'
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
