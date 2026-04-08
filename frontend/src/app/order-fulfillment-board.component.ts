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
  templateUrl: './order-fulfillment-board.component.html'
})
export class OrderFulfillmentBoardComponent {
  readonly releases = computed<ReleaseEntry[]>(() => this.releaseService.releasesSignal());

  constructor(
    public roles: RoleService,
    private releaseService: ReleaseService,
    private location: Location,
    private router: Router
  ) {}

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/');
  }
}
