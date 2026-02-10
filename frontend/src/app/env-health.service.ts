import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type EnvStatus = 'PASS' | 'WARNING' | 'FAIL' | string;

export interface EnvCheck {
  name: string;
  status: EnvStatus;
  detail?: string;
}

export interface EnvRun {
  id: string;
  site: string;
  fetchedAt: string;
  weekOf: string;
  sourceUrl: string;
  checks: EnvCheck[];
}

@Injectable({ providedIn: 'root' })
export class EnvHealthService {
  constructor(private http: HttpClient) {}

  list(): Observable<EnvRun[]> {
    return this.http.get<EnvRun[]>('/api/env-health');
  }

  sync(): Observable<EnvRun> {
    return this.http.post<EnvRun>('/api/env-health/sync', {});
  }
}
