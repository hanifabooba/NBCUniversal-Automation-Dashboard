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
  saving = signal(false);
  saveMessage = signal<string | null>(null);
  currentSummary: RunSummary = { name: 'Loading…', passed: 0, failed: 0, skipped: 0, total: 0 };
  savedRuns: RunSummary[] = [];
  resultRuns: ResultRun[] = [];
  selectedRunId: string | null = null;
  selectedResultUrl: string | null = null;

  constructor(private testResults: TestResultsService) {}

  ngOnInit(): void {
    this.loadSavedRuns();
    this.loadResultRuns();
    this.loadCurrentRun();
  }

  loadCurrentRun(): void {
    this.loading.set(true);
    this.error.set(null);

    // Try backend cached latest (from Jenkins/S3)
    this.testResults.getLatestCachedJson().subscribe({
      next: cached => {
        const results = Array.isArray(cached) ? cached : [];
        if (results.length) {
          this.currentSummary = this.computeSummary(results, 'Latest cached run');
          this.loading.set(false);
          return;
        }
        this.loading.set(false);
        this.error.set('No cached test.json available. Select a run to load its test.json.');
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No cached test.json available. Select a run to load its test.json.');
      }
    });
  }

  loadSavedRuns(): void {
    this.testResults.getRunSummaries().subscribe({
      next: runs => {
        this.savedRuns = runs || [];
      },
      error: err => {
        console.warn('Failed to load saved runs', err);
      }
    });
  }

  loadResultRuns(): void {
    this.testResults.getResultRuns().subscribe({
      next: runs => {
        this.resultRuns = runs || [];
        if (!this.selectedRunId && this.resultRuns.length) {
          this.selectRun(this.resultRuns[0]);
        }
      },
      error: err => {
        console.warn('Failed to load result runs', err);
      }
    });
  }

  saveCurrentRun(): void {
    if (!this.currentSummary) return;
    this.saving.set(true);
    this.saveMessage.set(null);
    this.testResults
      .saveRunSummary({
        name: this.currentSummary.name,
        passed: this.currentSummary.passed,
        failed: this.currentSummary.failed,
        skipped: this.currentSummary.skipped,
        total: this.currentSummary.total
      })
      .subscribe({
        next: saved => {
          this.saving.set(false);
          this.saveMessage.set('Run saved.');
          this.savedRuns = [saved, ...this.savedRuns].slice(0, 20);
        },
        error: err => {
          this.saving.set(false);
          this.saveMessage.set(err?.error?.message || 'Failed to save run.');
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
      #198754 0% ${passEnd}%,
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
    this.selectedRunId = run?.id ?? null;
    this.selectedResultUrl = null;
    this.resolveResultUrl(run);
    if (run && (run.total || run.passed || run.failed || run.skipped) && (!run.data || !run.data.length)) {
      this.currentSummary = {
        name: run.name,
        passed: run.passed || 0,
        failed: run.failed || 0,
        skipped: run.skipped || 0,
        total: run.total || 0
      };
      this.error.set(null);
      return;
    }
    if (run?.data && run.data.length) {
      this.currentSummary = this.computeSummary(run.data, run.name);
      return;
    }
    const key = this.deriveTestKey(run);
    if (!key) {
      const msg = 'Unable to find test.json for this run.';
      this.error.set(msg);
      this.currentSummary = { name: run?.name || 'Run', passed: 0, failed: 0, skipped: 0, total: 0 };
      return;
    }
    this.fetchRunData(run, key);
  }

  onRunChange(runId: string): void {
    const found = this.resultRuns.find(r => r.id === runId);
    if (found) {
      this.selectRun(found);
    }
  }

  private applySummary(results: TestResult[], name?: string): void {
    this.currentSummary = this.computeSummary(results, name);
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

  private fetchRunData(run: ResultRun, key: string): void {
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
        this.resultRuns = this.resultRuns.map(r => (r.id === run.id ? updatedRun : r));
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
