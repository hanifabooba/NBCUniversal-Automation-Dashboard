import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from './task.model';
import { TaskService } from './task.service';
import { EmployeeService } from './employee.service';
import { Employee } from './employee.model';

@Component({
  standalone: true,
  selector: 'app-employee-tasks',
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-tasks.component.html'
})
export class EmployeeTasksComponent implements OnInit {
  tasks: Task[] = [];
  employeeName = 'Demo Employee';
  employees: Employee[] = [];
  alertMessage = '';
  alertType: 'success' | 'danger' | '' = '';
  availableEmployees = ['Demo Employee', 'Field Worker 2'];

  constructor(
    private location: Location,
    private taskService: TaskService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.employeeService.getEmployees().subscribe({
      next: employees => {
        this.employees = employees;
        if (!this.employees.find(e => e.name === this.employeeName) && this.employees.length) {
          this.employeeName = this.employees[0].name;
        }
        this.loadTasks();
      },
      error: () => {
        this.setAlert('danger', 'Unable to load employee roster.');
        this.loadTasks();
      }
    });
  }

  private loadTasks(): void {
    this.taskService.getTasks({ employeeName: this.employeeName }).subscribe({
      next: tasks => (this.tasks = tasks),
      error: () => this.setAlert('danger', 'Unable to load your tasks right now.')
    });
  }

  onSubmit(task: Task) {
    // here you'd call backend; for now just log
    this.taskService.updateTask(task.id, { status: task.status, comment: task.comment }).subscribe({
      next: updated => {
        this.tasks = this.tasks.map(t => (t.id === updated.id ? updated : t));
        this.setAlert('success', 'Task update submitted successfully.');
      },
      error: () => this.setAlert('danger', 'Could not submit task update. Please retry.')
    });
  }

  goBack() {
    this.location.back();
  }

  onEmployeeChange() {
    this.loadTasks();
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
