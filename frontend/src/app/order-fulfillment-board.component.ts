import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  constructor(public roles: RoleService, private releaseService: ReleaseService) {}

  goBack(): void {
    if (history.length > 1) {
      history.back();
    }
  }
}
