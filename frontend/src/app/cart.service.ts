import { Injectable } from '@angular/core';
import { signal, computed } from '@angular/core';
import { CartItem, DeliveryMethod, OrderProduct, PaymentMethod, PaymentProvider, PaymentStatus } from './order.model';

@Injectable({ providedIn: 'root' })
export class CartService {
  items = signal<CartItem[]>([]);
  deliveryMethod = signal<DeliveryMethod>('motorbike');
  paymentMethod = signal<PaymentMethod>('momo');
  paymentProvider = signal<PaymentProvider>('mtn');
  paymentPhone = signal('054 482 3189'); // merchant number to receive funds
  paymentStatus = signal<PaymentStatus>('pending');
  deliveryAddress = signal('');
  distanceKm = signal(5);
  readonly baseDeliveryFee = 10;
  readonly perKmFee = 3;
  customerName = signal('');
  customerPhone = signal('');
  customerEmail = signal('');

  readonly itemCount = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));
  readonly total = computed(() => this.items().reduce((sum, item) => sum + item.price * item.quantity, 0));
  readonly deliveryFee = computed(() => this.baseDeliveryFee + this.perKmFee * this.distanceKm());

  addItem(product: OrderProduct, quantity: number, comment?: string): void {
    const existing = this.items().find(i => i.productId === product.id);
    if (existing) {
      this.items.update(items =>
        items.map(i =>
          i.productId === product.id
            ? {
                ...i,
                quantity: i.quantity + quantity,
                comment: comment !== undefined ? comment : i.comment
              }
            : i
        )
      );
    } else {
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        price: product.price,
        categoryId: product.categoryId,
        imageUrl: product.imageUrl,
        quantity: quantity,
        comment: comment ?? ''
      };
      this.items.set([...this.items(), newItem]);
    }
  }

  setPaymentProvider(provider: PaymentProvider): void {
    this.paymentProvider.set(provider);
  }

  setPaymentStatus(status: PaymentStatus): void {
    this.paymentStatus.set(status);
  }

  setDeliveryAddress(address: string): void {
    this.deliveryAddress.set(address);
  }

  setDistanceKm(km: number): void {
    const safeKm = Math.max(1, km);
    this.distanceKm.set(safeKm);
  }

  setCustomerName(name: string): void {
    this.customerName.set(name);
  }

  setCustomerPhone(phone: string): void {
    this.customerPhone.set(phone);
  }

  setCustomerEmail(email: string): void {
    this.customerEmail.set(email);
  }

  updateQuantity(productId: number, quantity: number): void {
    const safeQty = Math.max(1, quantity);
    this.items.update(items =>
      items.map(i => (i.productId === productId ? { ...i, quantity: safeQty } : i))
    );
  }

  updateComment(productId: number, comment: string): void {
    this.items.update(items =>
      items.map(i => (i.productId === productId ? { ...i, comment } : i))
    );
  }

  clear(): void {
    this.items.set([]);
  }

  setDelivery(method: DeliveryMethod): void {
    this.deliveryMethod.set(method);
  }

  setPayment(method: PaymentMethod): void {
    this.paymentMethod.set(method);
  }
}
