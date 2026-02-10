import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-manager-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './manager-dashboard.component.html'
})
export class ManagerDashboardComponent {
  constructor(private location: Location) {}

  goBack() {
    this.location.back();
  }
}
