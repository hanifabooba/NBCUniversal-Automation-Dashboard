import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SuperAdminAuthResponse {
  token: string;
  role: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SuperAdminAuthService {
  private readonly url = '/api/auth/super-admin';

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<SuperAdminAuthResponse> {
    return this.http.post<SuperAdminAuthResponse>(this.url, { username, password });
  }
}
