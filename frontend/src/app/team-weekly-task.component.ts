import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, transferArrayItem } from '@angular/cdk/drag-drop';

type TaskStatus = 'assigned' | 'pending' | 'blocked' | 'in-progress' | 'done';

interface WeeklyTask {
  id: number;
  weekOf: string; // ISO date for Monday of the week
  team: string;
  title: string;
  description: string;
  weeklyTasks?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  engineer: string;
  status: TaskStatus;
  blockedReason?: string;
  createdAt: string;
}

@Component({
  standalone: true,
  selector: 'app-team-weekly-task',
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './team-weekly-task.component.html'
})
export class TeamWeeklyTaskComponent implements OnInit {
  activeTab = signal<'weekly' | 'board' | 'report'>('weekly');
  reportFilter = signal<'week' | 'month' | 'year' | 'all'>('week');
  reportMonth = signal<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  reportYear = signal<string>(new Date().getFullYear().toString());

  // Form fields
  team = '';
  title = '';
  description = '';
  weeklyTasks = '';
  priority: WeeklyTask['priority'] = 'Medium';
  engineer = '';
  engineerOptions = ['David Reyes', 'Ibrahim Jalloh', 'Gopinath Palanisamy', 'Vikas Singh'];
  taskWeek = this.currentWeek();
  weekOptions = this.buildWeekOptions();
  blockedModalOpen = false;
  blockedReason = '';
  blockedReasonError = '';
  pendingBlockedTask: WeeklyTask | null = null;

  selectedWeek = signal<string>(this.currentWeek());
  readonly weekRange = computed(() => {
    const start = new Date(this.selectedWeek());
    const end = new Date(start);
    end.setDate(start.getDate() + 4);
    return `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`;
  });
  tasks = signal<WeeklyTask[]>([]);

  statusColumns: { key: TaskStatus; label: string; color: string }[] = [
    { key: 'assigned', label: 'Assigned', color: 'bg-light' },
    { key: 'pending', label: 'Pending', color: 'bg-warning-subtle' },
    { key: 'blocked', label: 'Blocked', color: 'bg-danger-subtle' },
    { key: 'in-progress', label: 'In-progress', color: 'bg-info-subtle' },
    { key: 'done', label: 'Done', color: 'bg-success-subtle' }
  ];
  dropListIds: TaskStatus[] = this.statusColumns.map(c => c.key);

  readonly tasksForWeek = computed(() =>
    this.tasks().filter(t => t.weekOf === this.selectedWeek()).sort((a, b) => a.id - b.id)
  );

  readonly filteredTasks = computed(() => {
    const filter = this.reportFilter();
    const month = this.reportMonth();
    const year = this.reportYear();
    return this.tasks().filter(t => {
      const taskDate = new Date(t.weekOf);
      if (filter === 'all') return true;
      if (filter === 'year') return taskDate.getFullYear().toString() === year;
      if (filter === 'month') {
        const ym = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}`;
        return ym === month;
      }
      // week filter defaults to selectedWeek
      return t.weekOf === this.selectedWeek();
    });
  });

  readonly stats = computed(() => {
    const data = this.filteredTasks();
    const byStatus: Record<TaskStatus, number> = {
      assigned: 0,
      pending: 0,
      blocked: 0,
      'in-progress': 0,
      done: 0
    };
    const byTeam: Record<string, number> = {};
    data.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byTeam[t.team || 'Unassigned'] = (byTeam[t.team || 'Unassigned'] || 0) + 1;
    });
    const total = data.length || 1;
    return {
      byStatus,
      byTeam,
      total
    };
  });

  ngOnInit(): void {
    this.loadTasks();
  }

  addTask(): void {
    const trimmedTitle = this.title.trim();
    if (!trimmedTitle) return;
    const now = new Date();
    const task: WeeklyTask = {
      id: Date.now(),
      weekOf: this.taskWeek || this.selectedWeek(),
      team: this.team.trim() || 'Team',
      title: trimmedTitle,
      description: this.description.trim(),
      weeklyTasks: this.weeklyTasks.trim(),
      priority: this.priority,
      engineer: this.engineer.trim() || 'Unassigned',
      status: 'assigned',
      createdAt: now.toISOString()
    };
    this.tasks.set([task, ...this.tasks()]);
    this.saveTasks();
    this.resetForm();
  }

  tasksByStatus(status: TaskStatus): WeeklyTask[] {
    return this.tasksForWeek().filter(t => t.status === status);
  }

  drop(event: CdkDragDrop<WeeklyTask[]>): void {
    const targetStatus = event.container.id as TaskStatus;
    const item = event.previousContainer.data[event.previousIndex];
    if (targetStatus === 'blocked' && item.status !== 'blocked') {
      this.openBlockedModal(item);
      return;
    }
    if (targetStatus !== 'blocked') {
      item.blockedReason = undefined;
    }
    item.status = targetStatus;
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    this.saveTasks();
  }

  updateEngineer(task: WeeklyTask, engineer: string): void {
    if (!task) return;
    task.engineer = engineer || 'Unassigned';
    this.saveTasks();
  }

  confirmBlockedReason(): void {
    const reason = this.blockedReason.trim();
    if (!reason) {
      this.blockedReasonError = 'Blocked reason is required.';
      return;
    }
    if (this.pendingBlockedTask) {
      this.pendingBlockedTask.status = 'blocked';
      this.pendingBlockedTask.blockedReason = reason;
      this.saveTasks();
    }
    this.closeBlockedModal();
  }

  cancelBlockedReason(): void {
    this.closeBlockedModal();
  }

  private openBlockedModal(task: WeeklyTask): void {
    this.pendingBlockedTask = task;
    this.blockedReason = '';
    this.blockedReasonError = '';
    this.blockedModalOpen = true;
  }

  private closeBlockedModal(): void {
    this.blockedModalOpen = false;
    this.blockedReason = '';
    this.blockedReasonError = '';
    this.pendingBlockedTask = null;
  }

  switchTab(tab: 'weekly' | 'board' | 'report'): void {
    this.activeTab.set(tab);
  }

  changeWeek(offset: number): void {
    const current = new Date(this.selectedWeek());
    current.setDate(current.getDate() + offset * 7);
    this.selectedWeek.set(this.weekStart(current));
    this.taskWeek = this.selectedWeek();
  }

  setWeekFromPicker(value: string): void {
    if (!value) return;
    const date = new Date(value);
    this.selectedWeek.set(this.weekStart(date));
    this.taskWeek = this.selectedWeek();
  }

  jumpToFuture(): void {
    const current = this.selectedWeek();
    const futureWeeks = Array.from(new Set(this.tasks().map(t => t.weekOf)))
      .filter(week => week > current)
      .sort();
    if (futureWeeks.length) {
      this.selectedWeek.set(futureWeeks[0]);
    } else {
      this.changeWeek(1);
    }
    this.taskWeek = this.selectedWeek();
  }

  pieStyle(): string {
    const s = this.stats().byStatus;
    const total = this.stats().total || 1;
    const passPct = Math.round((s.done / total) * 100);
    const inProgPct = Math.round((s['in-progress'] / total) * 100);
    const pendingPct = Math.round((s.pending / total) * 100);
    const blockedPct = Math.round((s.blocked / total) * 100);
    const assignedPct = Math.max(0, 100 - passPct - inProgPct - pendingPct - blockedPct);
    const c1 = passPct;
    const c2 = c1 + inProgPct;
    const c3 = c2 + pendingPct;
    const c4 = c3 + blockedPct;
    return `conic-gradient(
      #198754 0% ${c1}%,
      #0d6efd ${c1}% ${c2}%,
      #ffc107 ${c2}% ${c3}%,
      #dc3545 ${c3}% ${c4}%,
      #adb5bd ${c4}% 100%
    )`;
  }

  private resetForm(): void {
    this.team = '';
    this.title = '';
    this.description = '';
    this.weeklyTasks = '';
    this.priority = 'Medium';
    this.engineer = '';
    this.taskWeek = this.selectedWeek();
  }

  private loadTasks(): void {
    try {
      const raw = localStorage.getItem('weekly-tasks');
      const parsed: WeeklyTask[] = raw ? JSON.parse(raw) : [];
      this.tasks.set(parsed);
    } catch {
      this.tasks.set([]);
    }
  }

  private saveTasks(): void {
    try {
      localStorage.setItem('weekly-tasks', JSON.stringify(this.tasks()));
    } catch {
      // ignore storage errors
    }
  }

  currentWeek(): string {
    return this.weekStart(new Date());
  }

  private buildWeekOptions(count = 12): Array<{ value: string; label: string }> {
    const start = new Date(this.currentWeek());
    const options: Array<{ value: string; label: string }> = [];
    for (let i = 0; i < count; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i * 7);
      const value = this.weekStart(date);
      options.push({ value, label: `Week of ${value}` });
    }
    return options;
  }

  private weekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  }
}
