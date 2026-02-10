import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrderService } from './order.service';
import { Order } from './order.model';
import { Subscription } from 'rxjs';

const STAGES: { key: Order['stage']; label: string }[] = [
  { key: 'orders', label: 'Order Placed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'assign', label: 'Assign Driver/Biker' },
  { key: 'inroute', label: 'In Route' },
  { key: 'delivered', label: 'Delivered' }
];

@Component({
  standalone: true,
  selector: 'app-order-tracking',
  imports: [CommonModule, RouterLink],
  templateUrl: './order-tracking.component.html'
})
export class OrderTrackingComponent implements OnInit, OnDestroy {
  order?: Order;
  stages = STAGES;
  private orderId = 0;
  private sub?: Subscription;

  constructor(private route: ActivatedRoute, private orderService: OrderService) {}

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    this.sub = this.orderService.getOrders$().subscribe(list => {
      const found = list.find(o => o.id === this.orderId);
      if (found) this.order = found;
    });

    this.order = this.orderService.getOrderById(this.orderId);
    if (!this.order) {
      this.orderService.fetchOrder(this.orderId).subscribe(order => (this.order = order ?? this.order));
    }
  }

  currentIndex(): number {
    if (!this.order) return 0;
    const idx = this.stages.findIndex(s => s.key === this.order?.stage);
    return idx >= 0 ? idx : 0;
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }
}
