import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SuperAdminAuthService } from './super-admin-auth.service';

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  position: string;
  status: 'Active' | 'Invited' | 'Suspended';
  totalWorks: number;
  lastWork: string;
}

interface WorkStat {
  year: number;
  month: string;
  work: string;
  completed: number;
}

const MONTH_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  standalone: true,
  selector: 'app-super-admin',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './super-admin.component.html'
})
export class SuperAdminComponent {
  readonly roleOptions = ['Super Admin', 'Manager', 'Field Supervisor', 'Employee', 'Seasonal'];
  readonly positionOptions = ['Executive Operations', 'Crop Manager', 'Greenhouse Lead', 'Field Crew', 'Logistics', 'Quality'];
  readonly statusOptions: AdminUser['status'][] = ['Active', 'Invited', 'Suspended'];

  authorized = signal(false);
  authError = signal('');
  authForm = signal({ username: '', password: '' });
  authLoading = signal(false);

  setAuthField(field: 'username' | 'password', value: string): void {
    this.authForm.set({ ...this.authForm(), [field]: value });
  }

  users = signal<AdminUser[]>([
    {
      id: 1,
      name: 'Ama Quaye',
      email: 'ama.quaye@nbcuniversal.com',
      role: 'Super Admin',
      position: 'Executive Operations',
      status: 'Active',
      totalWorks: 128,
      lastWork: 'Budget sign-off'
    },
    {
      id: 2,
      name: 'Yaw Owusu',
      email: 'yaw.owusu@nbcuniversal.com',
      role: 'Manager',
      position: 'Crop Manager',
      status: 'Active',
      totalWorks: 92,
      lastWork: 'Seedling cycle review'
    },
    {
      id: 3,
      name: 'Naana Boateng',
      email: 'naana.boateng@nbcuniversal.com',
      role: 'Field Supervisor',
      position: 'Greenhouse Lead',
      status: 'Active',
      totalWorks: 74,
      lastWork: 'Drainage inspection'
    },
    {
      id: 4,
      name: 'Ishmael Tetteh',
      email: 'ishmael.tetteh@nbcuniversal.com',
      role: 'Employee',
      position: 'Field Crew',
      status: 'Invited',
      totalWorks: 21,
      lastWork: 'Harvest assist'
    }
  ]);

  readonly workLog: WorkStat[] = [
    { year: 2025, month: 'Jan', work: 'Harvest', completed: 32 },
    { year: 2025, month: 'Jan', work: 'Irrigation', completed: 18 },
    { year: 2025, month: 'Feb', work: 'Harvest', completed: 28 },
    { year: 2025, month: 'Feb', work: 'Packaging', completed: 22 },
    { year: 2025, month: 'Mar', work: 'Harvest', completed: 36 },
    { year: 2025, month: 'Mar', work: 'Quality', completed: 15 },
    { year: 2024, month: 'Dec', work: 'Harvest', completed: 24 },
    { year: 2024, month: 'Dec', work: 'Packaging', completed: 18 },
    { year: 2024, month: 'Nov', work: 'Logistics', completed: 19 },
    { year: 2024, month: 'Nov', work: 'Irrigation', completed: 14 }
  ];

  readonly availableYears = Array.from(new Set(this.workLog.map(w => w.year))).sort((a, b) => b - a);
  readonly workTypes = ['All works', ...Array.from(new Set(this.workLog.map(w => w.work)))];
  readonly months = ['All months', ...MONTH_ORDER];

  filterYear = this.availableYears[0];
  filterMonth = 'All months';
  filterWork = 'All works';
  sortMode: 'completedDesc' | 'completedAsc' | 'month' | 'work' = 'completedDesc';

  newUser: Partial<AdminUser> = {
    name: '',
    email: '',
    role: 'Employee',
    position: 'Field Crew',
    status: 'Invited',
    totalWorks: 0,
    lastWork: 'Not started'
  };

  readonly totalPeople = computed(() => this.users().length);
  readonly totalEmployees = computed(() => this.users().filter(u => u.role !== 'Super Admin').length);
  readonly activeCount = computed(() => this.users().filter(u => u.status === 'Active').length);
  readonly invitedCount = computed(() => this.users().filter(u => u.status === 'Invited').length);

  readonly chartData = computed(() => {
    let filtered = this.workLog.filter(entry => {
      const matchesYear = entry.year === this.filterYear;
      const matchesMonth = this.filterMonth === 'All months' || entry.month === this.filterMonth;
      const matchesWork = this.filterWork === 'All works' || entry.work === this.filterWork;
      return matchesYear && matchesMonth && matchesWork;
    });

    switch (this.sortMode) {
      case 'completedAsc':
        filtered = filtered.sort((a, b) => a.completed - b.completed);
        break;
      case 'month':
        filtered = filtered.sort(
          (a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month) || a.work.localeCompare(b.work)
        );
        break;
      case 'work':
        filtered = filtered.sort((a, b) => a.work.localeCompare(b.work) || b.completed - a.completed);
        break;
      case 'completedDesc':
      default:
        filtered = filtered.sort((a, b) => b.completed - a.completed);
        break;
    }

    return filtered;
  });

  get chartMax(): number {
    return Math.max(...this.chartData().map(d => d.completed), 10);
  }

  constructor(private authService: SuperAdminAuthService) {}

  attemptAccess(): void {
    const { username, password } = this.authForm();
    if (!username.trim() || !password.trim()) {
      this.authError.set('Username and password are required.');
      return;
    }
    this.authError.set('');
    this.authLoading.set(true);

    this.authService.login(username.trim(), password.trim()).subscribe({
      next: () => {
        this.authorized.set(true);
        this.authLoading.set(false);
      },
      error: err => {
        const message = err?.error?.message || 'Unable to authenticate right now.';
        this.authError.set(message);
        this.authLoading.set(false);
      }
    });
  }

  addUser(): void {
    if (!this.newUser.name?.trim() || !this.newUser.email?.trim()) {
      return;
    }

    const nextId = Math.max(...this.users().map(u => u.id)) + 1;
    const user: AdminUser = {
      id: nextId,
      name: this.newUser.name.trim(),
      email: this.newUser.email.trim(),
      role: this.newUser.role || 'Employee',
      position: this.newUser.position || 'Field Crew',
      status: this.newUser.status || 'Invited',
      totalWorks: this.newUser.totalWorks ?? 0,
      lastWork: this.newUser.lastWork || 'Not started'
    };

    this.users.set([...this.users(), user]);
    this.newUser = {
      name: '',
      email: '',
      role: 'Employee',
      position: 'Field Crew',
      status: 'Invited',
      totalWorks: 0,
      lastWork: 'Not started'
    };
  }

  deleteUser(id: number): void {
    if (id === 1) return;
    this.users.set(this.users().filter(user => user.id !== id));
  }
}
