import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ResultRun, RunSummary, TestResult, TestResultsService } from './test-results.service';

@Component({
  selector: 'app-test-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-results.component.html',
  styleUrls: ['./test-results.component.css']
})
export class TestResultsComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  runLoading = signal(false);
  currentSummary: RunSummary = { name: 'Loading…', passed: 0, failed: 0, skipped: 0, total: 0 };
  resultRuns: ResultRun[] = [];
  selectedRunId: string | null = null;
  selectedResultUrl: string | null = null;
  private resultRunsById = new Map<string, ResultRun>();
  private selectionVersion = 0;

  constructor(private testResults: TestResultsService) {}

  ngOnInit(): void {
    this.loadResultRuns();
  }

  loadCurrentRun(): void {
    this.loading.set(true);
    this.error.set(null);
    this.loadResultRuns();
  }

  loadResultRuns(): void {
    const selectedRunId = this.selectedRunId;
    this.testResults.getResultRuns().subscribe({
      next: runs => {
        this.resultRuns = runs || [];
        this.resultRunsById = new Map(this.resultRuns.map(run => [run.id, run]));
        this.loading.set(false);

        if (!this.resultRuns.length) {
          this.selectedRunId = null;
          this.selectedResultUrl = null;
          this.currentSummary = { name: 'No runs available', passed: 0, failed: 0, skipped: 0, total: 0 };
          this.error.set('No cached result runs available yet.');
          return;
        }

        const selected =
          (selectedRunId ? this.resultRunsById.get(selectedRunId) : undefined) || this.resultRuns[0];
        this.selectRun(selected);
      },
      error: err => {
        this.loading.set(false);
        this.resultRuns = [];
        this.resultRunsById.clear();
        this.selectedRunId = null;
        this.selectedResultUrl = null;
        this.currentSummary = { name: 'Run', passed: 0, failed: 0, skipped: 0, total: 0 };
        this.error.set(err?.error?.message || 'Unable to load cached result runs.');
        console.warn('Failed to load result runs', err);
      }
    });
  }

  computeSummary(results: TestResult[], nameOverride?: string): RunSummary {
    // Flatten to leaf tests (isLeaf or no children) and count statuses
    const leafTests: TestResult[] = [];
    const walk = (nodes: TestResult[]) => {
      for (const n of nodes || []) {
        if (n.children && n.children.length) {
          walk(n.children);
        } else {
          leafTests.push(n);
        }
      }
    };
    walk(results || []);

    const total = leafTests.length;
    const passed = leafTests.filter(r => r.status === 'PASS').length;
    const failed = leafTests.filter(r => r.status === 'FAIL').length;
    const skipped = leafTests.filter(r => r.status === 'SKIP').length;
    const name = nameOverride || `Run ${new Date().toLocaleString()}`;
    return { name, passed, failed, skipped, total };
  }

  percent(part: number, total: number): number {
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }

  pieStyle(run: RunSummary | null | undefined): string {
    if (!run) {
      return 'conic-gradient(#adb5bd 0% 100%)';
    }
    const total = run.total || 0;
    const passPct = this.percent(run.passed, total);
    const failPct = this.percent(run.failed, total);
    const skipPct = Math.max(0, 100 - passPct - failPct);
    const passEnd = passPct;
    const failEnd = passPct + failPct;
    return `conic-gradient(
      var(--results-pass) 0% ${passEnd}%,
      #dc3545 ${passEnd}% ${failEnd}%,
      #adb5bd ${failEnd}% 100%
    )`;
  }

  displayRunName(name: string | undefined | null): string {
    if (!name) return 'Run';
    const match = name.match(/\b\d{2}-\d{2}-\d{2}\/(?:desktop_web|mobile_web)\b/);
    return match ? match[0] : name;
  }

  selectRun(run: ResultRun): void {
    if (!run) return;

    const selectionVersion = ++this.selectionVersion;
    this.selectedRunId = run?.id ?? null;
    this.selectedResultUrl = null;
    this.resolveResultUrl(run);

    if (run.data?.length) {
      this.runLoading.set(false);
      this.currentSummary = this.computeSummary(run.data, run.name);
      this.error.set(null);
      return;
    }

    const immediateSummary = this.buildSummaryFromRun(run);
    if (immediateSummary) {
      this.currentSummary = immediateSummary;
    } else {
      this.currentSummary = { name: run.name || 'Run', passed: 0, failed: 0, skipped: 0, total: 0 };
    }

    if (this.hasStrongCachedSummary(run)) {
      this.runLoading.set(false);
      this.error.set(null);
      return;
    }

    const key = this.deriveTestKey(run);
    if (!key) {
      this.runLoading.set(false);
      const msg = 'Unable to find test.json for this run.';
      this.error.set(msg);
      return;
    }

    this.fetchRunData(run, key, selectionVersion);
  }

  onRunChange(event: Event): void {
    const runId = (event.target as HTMLSelectElement | null)?.value || '';
    const found = this.resultRunsById.get(runId);
    if (found) {
      this.selectRun(found);
    }
  }

  private applySummary(results: TestResult[], name?: string): void {
    this.currentSummary = this.computeSummary(results, name);
  }

  private buildSummaryFromRun(run: ResultRun | null | undefined): RunSummary | null {
    if (!run) return null;

    const hasAnySummaryValue = [run.total, run.passed, run.failed, run.skipped].some(value => value !== null && value !== undefined);
    if (!hasAnySummaryValue) {
      return null;
    }

    const passed = run.passed ?? 0;
    const failed = run.failed ?? 0;
    const skipped = run.skipped ?? 0;
    const total = run.total ?? passed + failed + skipped;

    return {
      name: run.name || 'Run',
      passed,
      failed,
      skipped,
      total
    };
  }

  private hasStrongCachedSummary(run: ResultRun | null | undefined): boolean {
    const summary = this.buildSummaryFromRun(run);
    if (!summary) return false;
    return summary.total > 0 || summary.passed > 0 || summary.failed > 0 || summary.skipped > 0;
  }

  private updateRunCache(updatedRun: ResultRun): void {
    this.resultRunsById.set(updatedRun.id, updatedRun);
    this.resultRuns = this.resultRuns.map(run => (run.id === updatedRun.id ? updatedRun : run));
  }

  private deriveTestKey(run: ResultRun | null | undefined): string | null {
    if (!run) return null;
    if (run.key) return run.key;
    if (run.resultUrl) {
      try {
        const url = new URL(run.resultUrl);
        const path = url.pathname.replace(/^\//, '');
        if (path) {
          return decodeURIComponent(path.replace(/result\.html$/i, 'test.json'));
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  private deriveResultHtmlKey(run: ResultRun | null | undefined): string | null {
    if (!run) return null;
    if (run.key) {
      return run.key.replace(/test\.json(\.gz|\.zip)?$/i, 'result.html');
    }
    if (run.resultUrl) {
      try {
        const url = new URL(run.resultUrl);
        const path = url.pathname.replace(/^\//, '');
        return decodeURIComponent(path);
      } catch {
        return null;
      }
    }
    return null;
  }

  private resolveResultUrl(run: ResultRun | null | undefined): void {
    if (!run) {
      this.selectedResultUrl = null;
      return;
    }
    if (run?.hasResultHtml && run?.key) {
      this.selectedResultUrl = `/api/results/result-html?key=${encodeURIComponent(run.key)}`;
      return;
    }
    if (run?.resultUrl) {
      this.selectedResultUrl = run.resultUrl;
      return;
    }
    const resultKey = this.deriveResultHtmlKey(run);
    if (!resultKey) {
      this.selectedResultUrl = run?.resultUrl || null;
      return;
    }
    this.testResults.getResultLink(resultKey).subscribe({
      next: resp => {
        this.selectedResultUrl = resp?.url || run?.resultUrl || null;
      },
      error: () => {
        this.selectedResultUrl = run?.resultUrl || null;
      }
    });
  }

  private fetchRunData(run: ResultRun, key: string, selectionVersion: number): void {
    this.runLoading.set(true);
    this.error.set(null);
    this.testResults.loadRunData(key).subscribe({
      next: resp => {
        const results = Array.isArray(resp?.data) ? resp.data : [];
        const updatedRun: ResultRun = {
          ...run,
          data: results,
          key: resp?.key || run.key,
          resultUrl: resp?.resultUrl || run.resultUrl,
          passed: resp?.summary?.passed ?? run.passed,
          failed: resp?.summary?.failed ?? run.failed,
          skipped: resp?.summary?.skipped ?? run.skipped,
          total: resp?.summary?.total ?? run.total
        };
        this.updateRunCache(updatedRun);

        const isCurrentSelection = selectionVersion === this.selectionVersion && this.selectedRunId === run.id;
        if (!isCurrentSelection) {
          return;
        }

        this.selectedResultUrl =
          updatedRun?.hasResultHtml && updatedRun?.key
            ? `/api/results/result-html?key=${encodeURIComponent(updatedRun.key)}`
            : updatedRun.resultUrl || this.selectedResultUrl;
        if (results.length) {
          this.applySummary(results, updatedRun.name);
        } else if (updatedRun.total || updatedRun.passed || updatedRun.failed || updatedRun.skipped) {
          this.currentSummary = {
            name: updatedRun.name,
            passed: updatedRun.passed || 0,
            failed: updatedRun.failed || 0,
            skipped: updatedRun.skipped || 0,
            total: updatedRun.total || 0
          };
        }
        this.runLoading.set(false);
      },
      error: err => {
        const isCurrentSelection = selectionVersion === this.selectionVersion && this.selectedRunId === run.id;
        if (!isCurrentSelection) {
          return;
        }

        const msg = err?.error?.message || 'Unable to load test.json for this run.';
        this.runLoading.set(false);
        if (run && (run.total || run.passed || run.failed || run.skipped)) {
          this.error.set(null);
          this.currentSummary = {
            name: run.name || 'Run',
            passed: run.passed || 0,
            failed: run.failed || 0,
            skipped: run.skipped || 0,
            total: run.total || 0
          };
        } else {
          this.error.set(msg);
          this.currentSummary = { name: run?.name || 'Run', passed: 0, failed: 0, skipped: 0, total: 0 };
        }
      }
    });
  }
}
