import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Task } from './task.model';

interface TaskQueryParams {
  employeeName?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private baseUrl = '/api/tasks';

  constructor(private http: HttpClient) {}

  getTasks(params?: TaskQueryParams): Observable<Task[]> {
    let httpParams = new HttpParams();
    if (params?.employeeName) {
      httpParams = httpParams.set('employeeName', params.employeeName);
    }
    if (params?.status) {
      httpParams = httpParams.set('status', params.status);
    }
    return this.http.get<Task[]>(this.baseUrl, { params: httpParams });
  }

  createTask(payload: Partial<Task> & { title: string; description: string; employeeName: string }): Observable<Task> {
    return this.http.post<Task>(this.baseUrl, payload);
  }

  updateTask(id: number, payload: Partial<Task>): Observable<Task> {
    return this.http.patch<Task>(`${this.baseUrl}/${id}`, payload);
  }
}
