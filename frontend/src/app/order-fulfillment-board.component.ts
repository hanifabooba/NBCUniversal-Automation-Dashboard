import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoleService } from './role.service';
import { ExecuteTestRunsService, SharedExecuteTestRun } from './execute-test-runs.service';

@Component({
  standalone: true,
  selector: 'app-order-fulfillment-board',
  imports: [CommonModule, FormsModule],
  templateUrl: './order-fulfillment-board.component.html',
  styleUrls: ['./order-fulfillment-board.component.css']
})
export class OrderFulfillmentBoardComponent implements OnInit, OnDestroy {
  releases: SharedExecuteTestRun[] = [];
  loading = false;
  loadError = '';
  private pollHandle?: ReturnType<typeof setInterval>;

  constructor(
    public roles: RoleService,
    private executeTestRuns: ExecuteTestRunsService,
    private location: Location,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadReleases(true);
    this.pollHandle = setInterval(() => this.loadReleases(false), 5000);
  }

  ngOnDestroy(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
  }

  get totalReleases(): number {
    return this.releases.length;
  }

  get releasesWithResults(): number {
    return this.releases.filter(release => !!release.resultUrl).length;
  }

  get productionReleases(): number {
    return this.releases.filter(release => String(release.env || '').toLowerCase().startsWith('prod')).length;
  }

  get onDemandReleases(): number {
    return this.releases.filter(release => release.runType === 'test-cases').length;
  }

  get latestRelease(): SharedExecuteTestRun | null {
    return this.releases[0] || null;
  }

  runTypeLabel(release: SharedExecuteTestRun): string {
    return release.runType === 'test-cases' ? 'On-demand feature files' : 'Tag suite';
  }

  selectionLabel(release: SharedExecuteTestRun): string {
    return release.displayLabel || release.feature || '—';
  }

  refreshBoard(): void {
    this.loadReleases(true);
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/');
  }

  private loadReleases(showLoader: boolean): void {
    if (showLoader) {
      this.loading = true;
    }

    this.executeTestRuns.listRuns(100).subscribe({
      next: runs => {
        this.releases = runs;
        this.loadError = '';
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Unable to load release-board entries from the shared run database.';
        this.loading = false;
      }
    });
  }
}
