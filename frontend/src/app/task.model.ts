export type TaskStatus = 'pending' | 'in progress' | 'complete';
export type TaskPriority = 'Low' | 'Normal' | 'High';

export interface Task {
  id: number;
  title: string;
  description: string;
  employeeName: string;
  priority: TaskPriority;
  dueDate?: string;
  status: TaskStatus;
  comment?: string;
  createdAt?: string;
  completedAt?: string | null;
}
