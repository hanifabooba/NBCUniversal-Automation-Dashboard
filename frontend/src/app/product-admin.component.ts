import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from './product.service';
import { RoleService } from './role.service';

@Component({
  standalone: true,
  selector: 'app-product-admin',
  imports: [CommonModule, FormsModule],
  templateUrl: './product-admin.component.html'
})
export class ProductAdminComponent {
  form = {
    name: '',
    shortDescription: '',
    imageUrl: '',
    price: 0,
    inStock: true
  };
  status = '';
  imageName = '';

  constructor(private products: ProductService, public roles: RoleService) {}

  canAccess = computed(() => this.roles.currentRole() === 'super-admin' || this.roles.currentRole() === 'manager');

  goBack(): void {
    if (history.length > 1) {
      history.back();
    }
  }

  submit(): void {
    const { name, shortDescription, imageUrl, price, inStock } = this.form;
    if (!name.trim() || !shortDescription.trim() || !imageUrl.trim()) {
      this.status = 'Name, description, and image are required.';
      return;
    }
    this.products.addProduct({
      name: name.trim(),
      shortDescription: shortDescription.trim(),
      imageUrl: imageUrl.trim(),
      price: Number(price) || 0,
      inStock
    });
    this.status = 'Product added.';
    this.form = { name: '', shortDescription: '', imageUrl: '', price: 0, inStock: true };
    this.imageName = '';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;
    const file = input.files[0];
    this.imageName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.form.imageUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
}
