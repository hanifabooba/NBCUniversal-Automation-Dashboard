import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Product } from './product.model';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private apiUrl = '/api/products';

  constructor(private http: HttpClient) {}

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(this.apiUrl).pipe(
      map(products =>
        products.map(p => ({
          ...p,
          slug: p.slug || p.name?.toLowerCase().replace(/\s+/g, '-'),
          categoryId: p.categoryId || 'production'
        }))
      )
    );
  }

  addProduct(product: Product): void {
    const existing: Product[] = JSON.parse(localStorage.getItem('products') || '[]');
    const next = [{ ...product, id: Date.now(), slug: product.slug || product.name.toLowerCase().replace(/\s+/g, '-') }, ...existing];
    localStorage.setItem('products', JSON.stringify(next));
  }
}
