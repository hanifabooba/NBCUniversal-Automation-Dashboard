import { Injectable, signal, computed } from '@angular/core';

export type UserRole = 'guest' | 'employee' | 'manager' | 'sales' | 'admin' | 'super-admin' | 'driver' | 'customer-service';
export interface UserContext {
  email: string;
  name: string;
  role: UserRole;
  token?: string;
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private storageKey = 'nbcuniversal-user';
  currentUser = signal<UserContext | null>(this.restoreUser());
  currentRole = computed<UserRole>(() => this.currentUser()?.role ?? 'guest');

  readonly isLoggedIn = computed(() => this.currentRole() !== 'guest');
  readonly isSuperAdmin = computed(() => this.currentRole() === 'super-admin');
  readonly canSeeOrders = computed(() => ['manager', 'sales', 'admin', 'super-admin'].includes(this.currentRole()));
  readonly canManageFulfillment = computed(() => ['sales', 'admin', 'super-admin'].includes(this.currentRole()));
  readonly canSeeSuperAdmin = computed(() => this.currentRole() === 'super-admin');
  readonly canViewEnquiries = computed(() => ['super-admin', 'manager', 'customer-service'].includes(this.currentRole()));

  setUser(user: UserContext): void {
    this.currentUser.set(user);
    localStorage.setItem(this.storageKey, JSON.stringify(user));
  }

  clearUser(): void {
    this.currentUser.set(null);
    localStorage.removeItem(this.storageKey);
  }

  private restoreUser(): UserContext | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserContext;
      return parsed && parsed.role ? parsed : null;
    } catch {
      return null;
    }
  }
}
