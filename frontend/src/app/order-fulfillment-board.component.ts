import { Component, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoleService } from './role.service';
import { ReleaseService, ReleaseEntry } from './release.service';

@Component({
  standalone: true,
  selector: 'app-order-fulfillment-board',
  imports: [CommonModule, FormsModule],
  templateUrl: './order-fulfillment-board.component.html',
  styleUrls: ['./order-fulfillment-board.component.css']
})
export class OrderFulfillmentBoardComponent {
  readonly releases = computed<ReleaseEntry[]>(() => this.releaseService.releasesSignal());

  constructor(
    public roles: RoleService,
    private releaseService: ReleaseService,
    private location: Location,
    private router: Router
  ) {}

  get totalReleases(): number {
    return this.releases().length;
  }

  get releasesWithResults(): number {
    return this.releases().filter(release => !!release.resultUrl).length;
  }

  get productionReleases(): number {
    return this.releases().filter(release => String(release.environment || '').toLowerCase().startsWith('prod')).length;
  }

  get onDemandReleases(): number {
    return this.releases().filter(release => release.runType === 'test-cases').length;
  }

  get latestRelease(): ReleaseEntry | null {
    return this.releases()[0] || null;
  }

  runTypeLabel(release: ReleaseEntry): string {
    return release.runType === 'test-cases' ? 'On-demand feature files' : 'Tag suite';
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/');
  }
}
