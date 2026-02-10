import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Employee } from './employee.model';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private baseUrl = '/api/employees';

  constructor(private http: HttpClient) {}

  getEmployees(): Observable<Employee[]> {
    return this.http.get<Employee[]>(this.baseUrl);
  }

  addEmployee(payload: Omit<Employee, 'id'>): Observable<Employee> {
    return this.http.post<Employee>(this.baseUrl, payload);
  }
}
