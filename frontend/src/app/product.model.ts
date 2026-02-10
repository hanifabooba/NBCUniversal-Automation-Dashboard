export interface Product {
  id?: number;
  name: string;
  slug?: string;
  shortDescription: string;
  imageUrl: string;
  price?: number;
  categoryId?: string;
  inStock?: boolean;
}
