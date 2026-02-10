import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, TaskPriority } from './task.model';
import { TaskService } from './task.service';
import { Employee } from './employee.model';
import { EmployeeService } from './employee.service';

@Component({
  standalone: true,
  selector: 'app-manager-tasks',
  imports: [CommonModule, FormsModule],
  templateUrl: './manager-tasks.component.html'
})
export class ManagerTasksComponent implements OnInit {
  employees: Employee[] = [];
  tasks: Task[] = [];
  newTask: Partial<Task> = { priority: 'Normal' };
  editingTaskId: number | null = null;
  taskDraft: Partial<Task> = {};
  alertMessage = '';
  alertType: 'success' | 'danger' | '' = '';
  employeeAlert = '';
  employeeAlertType: 'success' | 'danger' | '' = '';
  showEmployeeForm = false;
  newEmployee: Partial<Employee> = {};

  constructor(
    private location: Location,
    private taskService: TaskService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.loadEmployees();
    this.loadTasks();
  }

  private loadEmployees(): void {
    this.employeeService.getEmployees().subscribe({
      next: employees => (this.employees = employees),
      error: () => this.setEmployeeAlert('danger', 'Unable to load employee list.')
    });
  }

  private loadTasks(): void {
    this.taskService.getTasks().subscribe({
      next: tasks => (this.tasks = tasks),
      error: () => this.setAlert('danger', 'Unable to load tasks. Please try again.')
    });
  }

  createTask() {
    if (!this.newTask.title || !this.newTask.description || !this.newTask.employeeName) {
      return;
    }
    const priority = (this.newTask.priority as TaskPriority) ?? 'Normal';
    this.taskService
      .createTask({
        title: this.newTask.title,
        description: this.newTask.description,
        employeeName: this.newTask.employeeName!,
        priority,
        dueDate: this.newTask.dueDate
      })
      .subscribe({
        next: created => {
          this.tasks = [created, ...this.tasks];
          this.newTask = { priority: 'Normal' };
          this.setAlert('success', 'Task created successfully.');
        },
        error: () => this.setAlert('danger', 'Failed to create task. Please try again.')
      });
  }

  startEdit(task: Task) {
    this.editingTaskId = task.id;
    this.taskDraft = { ...task };
  }

  saveTask() {
    if (this.editingTaskId === null) {
      return;
    }
    if (!this.taskDraft.title || !this.taskDraft.description || !this.taskDraft.employeeName) {
      return;
    }
    const priority = (this.taskDraft.priority as TaskPriority) ?? 'Normal';
    this.taskService.updateTask(this.editingTaskId, { ...this.taskDraft, priority }).subscribe({
      next: updated => {
        this.tasks = this.tasks.map(t => (t.id === updated.id ? updated : t));
        this.setAlert('success', 'Task updated.');
        this.cancelEdit();
      },
      error: () => this.setAlert('danger', 'Could not save task changes.')
    });
  }

  cancelEdit() {
    this.editingTaskId = null;
    this.taskDraft = {};
  }

  goBack() {
    this.location.back();
  }

  private setAlert(type: 'success' | 'danger', message: string) {
      this.alertType = type;
      this.alertMessage = message;
      setTimeout(() => {
        this.alertMessage = '';
        this.alertType = '';
      }, 4000);
    }

  toggleEmployeeForm() {
    this.showEmployeeForm = !this.showEmployeeForm;
    if (!this.showEmployeeForm) {
      this.newEmployee = {};
    }
  }

  addEmployee() {
    if (!this.newEmployee.name || !this.newEmployee.phoneNumber || !this.newEmployee.address || !this.newEmployee.ghCard || !this.newEmployee.role) {
      this.setEmployeeAlert('danger', 'Please fill out every employee field.');
      return;
    }
    this.employeeService
      .addEmployee({
        name: this.newEmployee.name,
        phoneNumber: this.newEmployee.phoneNumber,
        address: this.newEmployee.address,
        ghCard: this.newEmployee.ghCard,
        role: this.newEmployee.role
      })
      .subscribe({
        next: employee => {
          this.employees = [...this.employees, employee];
          this.setEmployeeAlert('success', 'Employee added.');
          this.newEmployee = {};
          this.showEmployeeForm = false;
        },
        error: () => this.setEmployeeAlert('danger', 'Could not add employee.')
      });
  }

  private setEmployeeAlert(type: 'success' | 'danger', message: string) {
    this.employeeAlert = message;
    this.employeeAlertType = type;
    setTimeout(() => {
      this.employeeAlert = '';
      this.employeeAlertType = '';
    }, 4000);
  }
}
