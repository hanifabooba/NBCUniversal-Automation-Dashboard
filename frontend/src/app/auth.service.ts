import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RoleService, UserRole } from './role.service';
import { Observable, tap } from 'rxjs';

export interface AuthUser {
  email: string;
  name: string;
  role: UserRole;
  token?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = '/api/auth';

  constructor(private roles: RoleService, private http: HttpClient) {}

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${this.api}/login`, { email, password }).pipe(
      tap(user => this.roles.setUser(user))
    );
  }
}
