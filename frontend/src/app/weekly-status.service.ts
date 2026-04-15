import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import {
  WeeklyExecutionUpsertPayload,
  WeeklyStatusFilter,
  WeeklyStatusResponse
} from './weekly-status.models';

@Injectable({ providedIn: 'root' })
export class WeeklyStatusService {
  constructor(private http: HttpClient) {}

  getWeeklyStatus(filter: WeeklyStatusFilter): Observable<WeeklyStatusResponse> {
    return this.getJson<WeeklyStatusResponse>('/api/automation/weekly-status', {
      weekStart: filter.weekStart,
      weekEnd: filter.weekEnd,
      platform: filter.platform || '',
      suite: filter.suite || '',
      executionType: filter.executionType || ''
    });
  }

  runWeeklyJobs(weekStart: string, weekEnd: string): Observable<{ weekStart: string; weekEnd: string }> {
    return this.postJson<{ weekStart: string; weekEnd: string }>('/api/automation/weekly-status/run', {
      weekStart,
      weekEnd
    });
  }

  runWeeklyJob(jobId: string, weekStart: string, weekEnd: string): Observable<{ weekStart: string; weekEnd: string }> {
    return this.postJson<{ weekStart: string; weekEnd: string }>(`/api/automation/weekly-status/run/${encodeURIComponent(jobId)}`, {
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
    return this.postJson<WeeklyExecutionUpsertPayload & { id: string }>('/api/automation/weekly-status/executions', payload);
  }

  private getJson<T>(url: string, params?: Record<string, string>): Observable<T> {
    return this.http
      .get(url, {
        params: this.buildParams(params),
        observe: 'response',
        responseType: 'text'
      })
      .pipe(
        map(response => this.parseJsonResponse<T>(response)),
        catchError(err => throwError(() => this.normalizeJsonError(err)))
      );
  }

  private postJson<T>(url: string, body: unknown): Observable<T> {
    return this.http
      .post(url, body, {
        observe: 'response',
        responseType: 'text'
      })
      .pipe(
        map(response => this.parseJsonResponse<T>(response)),
        catchError(err => throwError(() => this.normalizeJsonError(err)))
      );
  }

  private buildParams(params?: Record<string, string>): HttpParams | undefined {
    if (!params) return undefined;

    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      httpParams = httpParams.set(key, value ?? '');
    }
    return httpParams;
  }

  private parseJsonResponse<T>(response: HttpResponse<string>): T {
    const rawBody = String(response.body ?? '').trim();
    if (!rawBody) {
      return {} as T;
    }

    try {
      return JSON.parse(rawBody) as T;
    } catch {
      throw this.createUnexpectedResponseError(response.status, rawBody);
    }
  }

  private normalizeJsonError(err: unknown): { status: number; error: unknown; message: string } {
    if (err instanceof HttpErrorResponse) {
      const rawBody = typeof err.error === 'string' ? err.error.trim() : '';
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody) as { message?: string };
          return {
            status: err.status,
            error: parsed,
            message: typeof parsed?.message === 'string' && parsed.message.trim() ? parsed.message.trim() : err.message
          };
        } catch {
          const lowerBody = rawBody.toLowerCase();
          const message =
            lowerBody.startsWith('<!doctype') || lowerBody.startsWith('<html')
              ? 'The weekly status service returned an unexpected response.'
              : rawBody;
          return {
            status: err.status,
            error: rawBody,
            message
          };
        }
      }

      return {
        status: err.status,
        error: err.error,
        message: err.message
      };
    }

    return {
      status: 0,
      error: err,
      message: err instanceof Error ? err.message : 'Unexpected weekly status error'
    };
  }

  private createUnexpectedResponseError(status: number, rawBody: string): { status: number; error: string; message: string } {
    const lowerBody = rawBody.toLowerCase();
    const message =
      lowerBody.startsWith('<!doctype') || lowerBody.startsWith('<html')
        ? 'The weekly status service returned an unexpected response.'
        : 'The weekly status service returned invalid JSON.';
    return {
      status,
      error: rawBody,
      message
    };
  }
}
