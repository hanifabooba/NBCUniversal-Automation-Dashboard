import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderService } from './order.service';
import { Order, OrderStatus } from './order.model';

type FilterStatus = 'all' | 'created' | 'in-progress' | 'done';

@Component({
  standalone: true,
  selector: 'app-order-history',
  imports: [CommonModule, FormsModule],
  templateUrl: './order-history.component.html'
})
export class OrderHistoryComponent {
  filterStatus: FilterStatus = 'all';
  searchJira = '';
  searchDate = '';
  searchDriver = '';
  message = '';

  constructor(private orders: OrderService) {}

  goBack(): void {
    if (history.length > 1) {
      history.back();
    }
  }

  get list(): Order[] {
    const all = this.orders.getOrders();
    const jiraTerm = this.searchJira.trim().toLowerCase();
    const filteredByJira = jiraTerm ? all.filter(o => (o.jiraTicket || '').toLowerCase().includes(jiraTerm)) : all;

    const dateTerm = this.searchDate ? this.searchDate : '';
    const normalizedSearchDate = dateTerm
      ? (() => {
          // Support both native yyyy-MM-dd from date input and typed mm/dd/yyyy
          const cleaned = dateTerm.includes('/') ? dateTerm.replace(/-/g, '/').replace(/\s+/g, '') : dateTerm;
          const parsed = new Date(cleaned);
          return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
        })()
      : '';
    const filteredByDate = dateTerm
      ? filteredByJira.filter(o => {
          if (!o.createdAt) return false;
          const created = new Date(o.createdAt);
          const iso = isNaN(created.getTime()) ? '' : created.toISOString().slice(0, 10);
          return normalizedSearchDate ? iso === normalizedSearchDate : iso === dateTerm;
        })
      : filteredByJira;

    const driverTerm = this.searchDriver.trim().toLowerCase();
    const filteredByDriver = driverTerm
      ? filteredByDate.filter(o => (o.riderName || '').toLowerCase().includes(driverTerm))
      : filteredByDate;

    this.message = '';
    if (jiraTerm && filteredByJira.length === 0) {
      this.message = 'No matches for that JIRA ticket.';
    } else if (dateTerm && filteredByDate.length === 0) {
      this.message = 'No orders found for that date.';
    } else if (driverTerm && filteredByDriver.length === 0) {
      this.message = 'No orders found for that driver.';
    }

    if (this.filterStatus === 'all') return filteredByDriver;
    return filteredByDriver.filter(o => this.mapStatus(o.status) === this.filterStatus);
  }

  applySearch(): void {
    // Trigger recompute via getter; no-op body
  }

  printPage(): void {
    window.print();
  }

  clearSearch(type: 'id' | 'date' | 'driver'): void {
    if (type === 'id') this.searchJira = '';
    if (type === 'date') this.searchDate = '';
    if (type === 'driver') this.searchDriver = '';
  }

  mapStatus(status: OrderStatus): FilterStatus {
    if (status === 'pending') return 'created';
    if (status === 'out_for_delivery') return 'in-progress';
    if (status === 'completed') return 'done';
    return 'all';
  }
}
