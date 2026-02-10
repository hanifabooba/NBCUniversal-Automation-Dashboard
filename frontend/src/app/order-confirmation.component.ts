import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { OrderService } from './order.service';
import { Order } from './order.model';

@Component({
  standalone: true,
  selector: 'app-order-confirmation',
  imports: [CommonModule, RouterLink],
  templateUrl: './order-confirmation.component.html'
})
export class OrderConfirmationComponent implements OnInit {
  order?: Order;
  mapUrl?: SafeResourceUrl;

  constructor(private route: ActivatedRoute, private orderService: OrderService, private sanitizer: DomSanitizer) {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.order = this.orderService.getOrderById(id);
    if (this.order) this.updateMap(this.order);
  }

  ngOnInit(): void {
    if (!this.order) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      this.orderService.fetchOrder(id).subscribe(order => {
        this.order = order ?? this.order;
        if (this.order) this.updateMap(this.order);
      });
    }
  }

  get deliveryLabel(): string {
    return `Motor bike delivery · ${this.order?.distanceKm ?? 0} km`;
  }

  get itemsTotal(): number {
    if (this.order?.total !== undefined && this.order.deliveryFee !== undefined) {
      return this.order.total - this.order.deliveryFee;
    }
    if (!this.order?.items) return 0;
    return this.order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get deliveryFee(): number {
    return this.order?.deliveryFee ?? 0;
  }

  get grandTotal(): number {
    if (this.order?.total !== undefined) return this.order.total;
    return this.itemsTotal + this.deliveryFee;
  }

  private updateMap(order: Order): void {
    const address = order.deliveryAddress || `${order.customerName || 'Customer'}, Ghana`;
    const encoded = encodeURIComponent(address);
    const url = `https://www.google.com/maps?q=${encoded}&output=embed`;
    this.mapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
