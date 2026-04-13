import { Component, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CartService } from './cart.service';
import { OrderProduct } from './order.model';

interface OrderCategory {
  id: string;
  name: string;
  description: string;
}

interface RunCard {
  id: number;
  status: string;
  who: string;
  when: string;
  date: string;
  env: string;
  feature: string;
  runType?: 'tag' | 'test-cases';
  featureFiles?: string[];
  branch?: string;
  comment?: string;
  jira?: string;
}

@Component({
  standalone: true,
  selector: 'app-test-history',
  imports: [CommonModule, RouterLink],
  templateUrl: './test-history.component.html',
  styleUrls: ['./test-history.component.css']
})
export class TestHistoryComponent implements OnInit, OnDestroy {
  categories: OrderCategory[] = [
    { id: 'production', name: 'Production', description: 'Live environment runs.' },
    { id: 'preprod', name: 'Preprod', description: 'Pre-production verification runs.' },
    { id: 'stage', name: 'Stage', description: 'Staging environment shakedown.' }
  ];

  products: OrderProduct[] = [
    {
      id: 1,
      name: 'Production sanity',
      categoryId: 'production',
      price: 0,
      unit: '@mw_sanity',
      description: 'Run sanity suite on production.',
      imageUrl: '/assets/images/chili.png'
    },
    {
      id: 2,
      name: 'Production regression',
      categoryId: 'production',
      price: 0,
      unit: '@mw_regression',
      description: 'Full regression on production.',
      imageUrl: '/assets/images/carrot.png'
    },
    {
      id: 3,
      name: 'Preprod sanity',
      categoryId: 'preprod',
      price: 0,
      unit: '@mw_sanity',
      description: 'Preprod sanity sweep.',
      imageUrl: '/assets/images/onion.png'
    },
    {
      id: 4,
      name: 'Preprod regression',
      categoryId: 'preprod',
      price: 0,
      unit: '@mw_regression',
      description: 'Preprod regression suite.',
      imageUrl: '/assets/images/beet.png'
    },
    {
      id: 5,
      name: 'Stage sanity',
      categoryId: 'stage',
      price: 0,
      unit: '@mw_sanity',
      description: 'Stage sanity sweep.',
      imageUrl: '/assets/images/tomato.png'
    },
    {
      id: 6,
      name: 'Stage regression',
      categoryId: 'stage',
      price: 0,
      unit: '@mw_regression',
      description: 'Stage regression suite.',
      imageUrl: '/assets/images/turmeric.png'
    }
  ];

  selectedCategory = signal<string>(this.categories[0].id);
  quantities = signal<Record<number, number>>(
    this.products.reduce((acc, product) => ({ ...acc, [product.id]: 1 }), {})
  );
  comments = signal<Record<number, string>>({});
  cartMessage = signal('');
  private messageTimer?: ReturnType<typeof setTimeout>;
  runsByEnv: Record<string, RunCard[]> = {};
  private pollHandle: any;
  currentCategoryName = '';

  readonly filteredProducts = computed(() =>
    this.products.filter(p => p.categoryId === this.selectedCategory())
  );

  readonly cartCount = this.cartService.itemCount;

  constructor(route: ActivatedRoute, private cartService: CartService) {
    route.queryParamMap.subscribe(params => {
      const incoming = params.get('category');
      if (incoming && this.categories.some(c => c.id === incoming)) {
        this.selectedCategory.set(incoming);
        this.setCurrentCategoryName(incoming);
      }
    });
    this.setCurrentCategoryName(this.selectedCategory());
  }

  ngOnInit(): void {
    this.loadRuns();
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.messageTimer) clearTimeout(this.messageTimer);
  }

  get allRuns(): RunCard[] {
    return this.categories.flatMap(category => this.runsByEnv[category.id] || []);
  }

  get selectedRuns(): RunCard[] {
    return this.runsByEnv[this.selectedCategory()] || [];
  }

  get selectedCategoryDescription(): string {
    return this.categories.find(category => category.id === this.selectedCategory())?.description || '';
  }

  get totalTrackedRuns(): number {
    return this.allRuns.length;
  }

  get activeRuns(): number {
    return this.allRuns.filter(run => ['pending', 'queued', 'inprogress', 'running'].includes(String(run.status || '').toLowerCase())).length;
  }

  get completedRuns(): number {
    return this.allRuns.filter(run => String(run.status || '').toLowerCase() === 'completed').length;
  }

  get failedRuns(): number {
    return this.allRuns.filter(run => ['failure', 'failed'].includes(String(run.status || '').toLowerCase())).length;
  }

  selectCategory(categoryId: string): void {
    this.selectedCategory.set(categoryId);
    this.setCurrentCategoryName(categoryId);
  }

  categoryRunCount(categoryId: string): number {
    return (this.runsByEnv[categoryId] || []).length;
  }

  badgeClass(status: string | null | undefined): string {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'pending' || normalized === 'queued') return 'text-bg-warning';
    if (normalized === 'inprogress' || normalized === 'running') return 'text-bg-info';
    if (normalized === 'completed') return 'text-bg-success';
    if (normalized === 'failure' || normalized === 'failed') return 'text-bg-danger';
    return 'text-bg-secondary';
  }

  runTypeLabel(run: RunCard): string {
    return run.runType === 'test-cases' ? 'On-demand feature files' : 'Tag suite';
  }

  changeQuantity(productId: number, delta: number): void {
    this.quantities.update(current => {
      const next = Math.max(1, (current[productId] ?? 1) + delta);
      return { ...current, [productId]: next };
    });
  }

  updateComment(productId: number, comment: string): void {
    this.comments.update(current => ({ ...current, [productId]: comment }));
  }

  addToCart(productId: number): void {
    const quantity = this.quantities()[productId] ?? 1;
    const comment = this.comments()[productId] || '';
    const product = this.products.find(p => p.id === productId);
    if (product) {
      this.cartService.addItem(product, quantity, comment);
      this.cartMessage.set(`${quantity} x ${product.name} added to cart`);
      this.updateComment(productId, '');
    } else {
      this.cartMessage.set('Added to cart');
    }
    this.resetMessageTimer();
  }

  private startPolling(): void {
    this.pollHandle = setInterval(() => this.loadRuns(), 5000);
  }

  private loadRuns(): void {
    try {
      const raw = localStorage.getItem('jenkins-runs');
      const runs: RunCard[] = raw ? JSON.parse(raw) : [];
      const grouped: Record<string, RunCard[]> = {};
      this.categories.forEach(c => (grouped[c.id] = []));
      runs.forEach(run => {
        const envKey = this.normalizeEnv(run.env);
        if (grouped[envKey]) {
          grouped[envKey].push(run);
        }
      });
      // Limit cards per env
      Object.keys(grouped).forEach(k => {
        grouped[k] = grouped[k].slice(0, 5);
      });
      this.runsByEnv = grouped;
    } catch {
      this.runsByEnv = {};
    }
  }

  private setCurrentCategoryName(categoryId: string): void {
    const cat = this.categories.find(c => c.id === categoryId);
    this.currentCategoryName = cat?.name || '';
  }

  private normalizeEnv(env: string | null | undefined): string {
    const val = (env || '').toLowerCase();
    if (val.startsWith('prod')) return 'production';
    if (val.startsWith('pre')) return 'preprod';
    if (val.startsWith('stage')) return 'stage';
    return val;
  }

  private resetMessageTimer(): void {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }
    this.messageTimer = setTimeout(() => this.cartMessage.set(''), 2200);
  }

  mobileImage(url: string): string {
    if (!url || !url.endsWith('.png')) return url;
    return url.replace('.png', '_m.png');
  }
}
