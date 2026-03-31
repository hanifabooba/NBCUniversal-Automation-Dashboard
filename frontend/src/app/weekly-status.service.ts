import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  WeeklyExecutionUpsertPayload,
  WeeklyStatusFilter,
  WeeklyStatusResponse
} from './weekly-status.models';

@Injectable({ providedIn: 'root' })
export class WeeklyStatusService {
  constructor(private http: HttpClient) {}

  getWeeklyStatus(filter: WeeklyStatusFilter): Observable<WeeklyStatusResponse> {
    return this.http.get<WeeklyStatusResponse>('/api/automation/weekly-status', {
      params: {
        weekStart: filter.weekStart,
        weekEnd: filter.weekEnd,
        platform: filter.platform || '',
        suite: filter.suite || '',
        executionType: filter.executionType || ''
      }
    });
  }

  runWeeklyJobs(weekStart: string, weekEnd: string): Observable<{ weekStart: string; weekEnd: string }> {
    return this.http.post<{ weekStart: string; weekEnd: string }>('/api/automation/weekly-status/run', {
      weekStart,
      weekEnd
    });
  }

  runWeeklyJob(jobId: string, weekStart: string, weekEnd: string): Observable<{ weekStart: string; weekEnd: string }> {
    return this.http.post<{ weekStart: string; weekEnd: string }>(`/api/automation/weekly-status/run/${encodeURIComponent(jobId)}`, {
      weekStart,
      weekEnd
    });
  }

  exportWeeklyStatus(filter: WeeklyStatusFilter): Observable<Blob> {
    return this.http.get('/api/automation/weekly-status/export', {
      params: {
        weekStart: filter.weekStart,
        weekEnd: filter.weekEnd,
        platform: filter.platform || '',
        suite: filter.suite || '',
        executionType: filter.executionType || ''
      },
      responseType: 'blob'
    });
  }

  upsertExecution(payload: WeeklyExecutionUpsertPayload): Observable<WeeklyExecutionUpsertPayload & { id: string }> {
    return this.http.post<WeeklyExecutionUpsertPayload & { id: string }>('/api/automation/weekly-status/executions', payload);
  }
}
