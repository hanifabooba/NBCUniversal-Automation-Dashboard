import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderService } from './order.service';
import { Order, OrderStatus } from './order.model';

@Component({
  standalone: true,
  selector: 'app-fulfillment',
  imports: [CommonModule, FormsModule],
  templateUrl: './fulfillment.component.html'
})
export class FulfillmentComponent {
  riderName = '';
  riderPhone = '';
  selectedStatus: OrderStatus = 'out_for_delivery';

  constructor(public orders: OrderService) {}

  get pendingOrders(): Order[] {
    return this.orders.getOrders().filter(o => o.status === 'pending' || o.status === 'out_for_delivery');
  }

  assign(orderId: number): void {
    if (!this.riderName.trim()) return;
    this.orders.moveStage(orderId, 'assign', this.riderName.trim(), this.riderPhone.trim());
    this.riderName = '';
    this.riderPhone = '';
  }

  complete(orderId: number): void {
    this.orders.moveStage(orderId, 'delivered');
  }
}
