import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RoleService } from './role.service';

interface DashboardCard {
  title: string;
  description: string;
  icon: string;
  link: string;
}

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  cards = computed<DashboardCard[]>(() => {
    const role = this.roles.currentRole();
    const list: DashboardCard[] = [];

    // Always show key status boards
    list.push({
      title: 'Automation Weekly Status',
      description: 'View weekly automation results and releases.',
      icon: 'bi-clock-history',
      link: '/automation-weekly-status'
    });
    list.push({
      title: 'Automation KPI',
      description: 'Executive scorecard for release readiness, stability, and coverage.',
      icon: 'bi-speedometer2',
      link: '/automation-kpi'
    });
    list.push({
      title: 'Test Cases Hub',
      description: 'One-stop links to QA test case sources.',
      icon: 'bi-journal-text',
      link: '/test-cases-hub'
    });

    if (this.roles.canManageFulfillment()) {
      list.push({
        title: 'Release Board',
        description: 'Move releases through QA stages.',
        icon: 'bi-kanban-fill',
        link: '/releaseboard'
      });
    }
    if (['super-admin', 'manager'].includes(role)) {
      list.push({
        title: 'Load Products',
        description: 'Add or update catalog items.',
        icon: 'bi-box-arrow-up',
        link: '/product-admin'
      });
    }
    if (this.roles.canViewEnquiries()) {
      list.push({
        title: 'Enquiries',
        description: 'Respond to customer enquiries.',
        icon: 'bi-chat-dots-fill',
        link: '/enquiries'
      });
    }
    if (role === 'super-admin') {
      list.push({
        title: 'Super Admin',
        description: 'Manage users and roles.',
        icon: 'bi-shield-lock-fill',
        link: '/super-admin'
      });
    }
    return list;
  });

  constructor(public roles: RoleService) {}

  get primaryCard(): DashboardCard | null {
    return this.cards()[0] || null;
  }

  get secondaryCards(): DashboardCard[] {
    return this.cards().slice(1);
  }

  get quickStats(): Array<{ label: string; value: string; detail: string }> {
    const cardCount = this.cards().length;
    const role = this.roles.currentRole();
    const userName = this.roles.currentUser()?.name || 'team member';

    return [
      {
        label: 'Active boards',
        value: `${cardCount}`,
        detail: 'Operational surfaces available from this landing dashboard.'
      },
      {
        label: 'Signed in as',
        value: userName,
        detail: `Current role: ${role}`
      },
      {
        label: 'Focus area',
        value: 'Release control',
        detail: 'Weekly status, KPI tracking, execution entry points, and native app staging.'
      }
    ];
  }
}
