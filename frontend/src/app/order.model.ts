export type OrderStatus = 'pending' | 'out_for_delivery' | 'completed';
export type DeliveryMethod = 'motorbike';
export type PaymentMethod = 'momo';
export type PaymentProvider = 'mtn' | 'airteltigo' | 'vodafone';
export type PaymentStatus = 'pending' | 'success' | 'failed';
export type FulfillmentStage = 'orders' | 'preparing' | 'assign' | 'inroute' | 'delivered';

export interface OrderProduct {
  id: number;
  name: string;
  categoryId: string;
  price: number;
  unit: string;
  description: string;
  imageUrl: string;
}

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  categoryId: string;
  quantity: number;
  imageUrl?: string;
  comment?: string;
}

export interface Order {
  id: number;
  items: CartItem[];
  total: number;
  deliveryFee: number;
  distanceKm: number;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  paymentProvider: PaymentProvider;
  paymentPhone: string;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  status: OrderStatus;
  stage: FulfillmentStage;
  riderName?: string;
  riderPhone?: string;
  createdAt: string;
  deliveredAt?: string;
  localOnly?: boolean;
  // Optional metadata for automation runs
  jiraTicket?: string;
  resultUrl?: string;
}
