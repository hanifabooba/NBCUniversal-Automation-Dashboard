import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';
import { CartItem, DeliveryMethod, Order, OrderStatus, PaymentMethod, PaymentProvider, PaymentStatus, FulfillmentStage } from './order.model';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private apiUrl = '/api/orders';
  private orders$ = new BehaviorSubject<Order[]>([]);
  ordersSignal = toSignal(this.orders$.asObservable(), { initialValue: [] as Order[] });

  constructor(private http: HttpClient) {
    this.refresh();
  }

  refresh(): void {
    this.http
      .get<Order[]>(this.apiUrl)
      .pipe(catchError(() => of([])))
      .subscribe(list => this.orders$.next(list));
  }

  getOrders(): Order[] {
    return this.orders$.value;
  }

  getOrders$(): Observable<Order[]> {
    return this.orders$.asObservable();
  }

  getOrderById(id: number): Order | undefined {
    return this.orders$.value.find(o => o.id === id);
  }

  fetchOrder(id: number): Observable<Order | null> {
    return this.http.get<Order>(`${this.apiUrl}/${id}`).pipe(
      catchError(() => of(null)),
      tap(order => {
        if (order) {
          const existing = this.orders$.value;
          const updated = existing.some(o => o.id === order.id)
            ? existing.map(o => (o.id === order.id ? order : o))
            : [order, ...existing];
          this.orders$.next(updated);
        }
      })
    );
  }

  refreshOrder(id: number): void {
    this.fetchOrder(id).subscribe();
  }

  createOrder(payload: {
    items: CartItem[];
    deliveryMethod: DeliveryMethod;
    paymentMethod: PaymentMethod;
    paymentProvider: PaymentProvider;
    paymentPhone: string;
    paymentStatus: PaymentStatus;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    deliveryAddress: string;
    distanceKm: number;
    deliveryFee: number;
    riderName?: string;
    riderPhone?: string;
  }): Observable<Order> {
    const body = {
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      deliveryAddress: payload.deliveryAddress,
      distanceKm: payload.distanceKm,
      deliveryFee: payload.deliveryFee,
      status: 'pending' as OrderStatus,
      stage: 'orders',
      paymentStatus: payload.paymentStatus,
      paymentProvider: payload.paymentProvider,
      paymentPhone: payload.paymentPhone,
      riderName: payload.riderName ?? '',
      riderPhone: payload.riderPhone ?? '',
      items: payload.items.map(i => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        productId: i.productId ?? null,
        comment: i.comment ?? ''
      }))
    };
    return this.http.post<Order>(this.apiUrl, body).pipe(
      catchError(() =>
        of({
          id: -Date.now(),
          total: payload.items.reduce((sum, i) => sum + i.price * i.quantity, 0) + payload.deliveryFee,
          deliveryFee: payload.deliveryFee,
          distanceKm: payload.distanceKm,
          deliveryMethod: payload.deliveryMethod,
          paymentMethod: payload.paymentMethod,
          paymentProvider: payload.paymentProvider,
          paymentPhone: payload.paymentPhone,
          paymentStatus: payload.paymentStatus,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerEmail: payload.customerEmail,
          deliveryAddress: payload.deliveryAddress,
          status: 'pending',
          stage: 'orders',
          riderName: payload.riderName ?? '',
          riderPhone: payload.riderPhone ?? '',
          createdAt: new Date().toISOString(),
          items: payload.items,
          localOnly: true
        } as Order)
      ),
      tap(order => this.orders$.next([order, ...this.orders$.value]))
    );
  }

  moveStage(id: number, stage: Order['stage'], riderName?: string, riderPhone?: string): void {
    const optimisticStatus: OrderStatus =
      stage === 'delivered'
        ? 'completed'
        : stage === 'assign' || stage === 'inroute'
        ? 'out_for_delivery'
        : 'pending';
    // optimistic update
    const optimistic = this.orders$.value.map(o =>
      o.id === id
        ? ({
            ...o,
            stage: stage as FulfillmentStage,
            status: optimisticStatus,
            riderName: riderName ?? o.riderName,
            riderPhone: riderPhone ?? o.riderPhone
          } as Order)
        : o
    );
    this.orders$.next(optimistic);

    const localOrder = this.orders$.value.find(o => o.id === id);
    if (localOrder?.localOnly || id < 0) {
      return;
    }

    this.http
      .patch<Order>(`${this.apiUrl}/${id}/stage`, { stage, riderName, riderPhone })
      .pipe(
        catchError(() => of(null))
      )
      .subscribe(order => {
        if (!order) return;
        const updated = this.orders$.value.map(o => (o.id === id ? order : o));
        this.orders$.next(updated);
      });
  }
}
