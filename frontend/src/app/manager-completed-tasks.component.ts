import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Task } from './task.model';
import { TaskService } from './task.service';

@Component({
  standalone: true,
  selector: 'app-manager-completed-tasks',
  imports: [CommonModule],
  templateUrl: './manager-completed-tasks.component.html'
})
export class ManagerCompletedTasksComponent implements OnInit {
  tasks: Task[] = [];
  sortKey: 'employeeName' | 'completedAt' = 'employeeName';
  loading = false;
  alertMessage = '';
  alertType: 'success' | 'danger' | '' = '';

  constructor(private location: Location, private taskService: TaskService) {}

  ngOnInit(): void {
    this.loadCompletedTasks();
  }

  private loadCompletedTasks(): void {
    this.loading = true;
    this.taskService.getTasks({ status: 'complete' }).subscribe({
      next: tasks => {
        this.tasks = tasks;
        this.loading = false;
        this.sortBy(this.sortKey);
      },
      error: () => {
        this.loading = false;
        this.setAlert('danger', 'Unable to load completed tasks.');
      }
    });
  }

  sortBy(key: 'employeeName' | 'completedAt') {
    this.sortKey = key;
    this.tasks.sort((a, b) => {
      const aVal = a[key] ?? '';
      const bVal = b[key] ?? '';
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });
  }

  goBack() {
    this.location.back();
  }

  refresh() {
    this.loadCompletedTasks();
    this.setAlert('success', 'Task list refreshed.');
  }

  private setAlert(type: 'success' | 'danger', message: string) {
    this.alertType = type;
    this.alertMessage = message;
    setTimeout(() => {
      this.alertMessage = '';
      this.alertType = '';
    }, 4000);
  }
}
