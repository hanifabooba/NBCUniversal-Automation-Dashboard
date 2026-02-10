import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-employee-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './employee-dashboard.component.html'
})
export class EmployeeDashboardComponent {
  employeeName = 'Demo Employee';
  role = 'Field Worker';

  constructor(private location: Location) {}

  goBack() {
    this.location.back();
  }
}
