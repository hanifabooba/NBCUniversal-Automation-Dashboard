import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, throwError } from 'rxjs';
import {
  AutomationKpiResponse,
  WeeklyExecutionUpsertPayload,
  WeeklyStatusFilter,
  WeeklyStatusResponse
} from './weekly-status.models';
import { buildAutomationKpiResponseFromWeeklyBoards, getWorkingWeekRange } from './weekly-status.utils';

@Injectable({ providedIn: 'root' })
export class WeeklyStatusService {
  private readonly resultRunsUrl = '/api/result-runs';
  private readonly weeklyStatusFallbackUrl = '/api/results/weekly-status';
  private readonly automationKpiFallbackUrl = '/api/results/automation-kpi';
  private readonly weeklyStatusLastResortUrl = '/api/automation/weekly-status';
  private readonly automationKpiLastResortUrl = '/api/automation/kpi';

  constructor(private http: HttpClient) {}

  getWeeklyStatus(filter: WeeklyStatusFilter): Observable<WeeklyStatusResponse> {
    return this.fetchWeeklyStatusFromResultRuns(filter).pipe(
      catchError(err => {
        if (this.shouldTryAlternateApi(err)) {
          return this.fetchWeeklyStatus(filter, this.weeklyStatusFallbackUrl).pipe(
            catchError(fallbackErr => {
              if (this.shouldTryAlternateApi(fallbackErr)) {
                return this.fetchWeeklyStatus(filter, this.weeklyStatusLastResortUrl);
              }
              return throwError(() => fallbackErr);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }

  getAutomationKpi(filter: WeeklyStatusFilter): Observable<AutomationKpiResponse> {
    return this.fetchAutomationKpiFromResultRuns(filter).pipe(
      catchError(err => {
        if (this.shouldTryAlternateApi(err)) {
          return this.fetchAutomationKpi(filter, this.automationKpiFallbackUrl).pipe(
            catchError(fallbackErr => {
              if (this.shouldTryAlternateApi(fallbackErr)) {
                return this.fetchAutomationKpi(filter, this.automationKpiLastResortUrl).pipe(
                  catchError(lastResortErr => {
                    if (this.shouldFallbackToWeeklyStatus(lastResortErr)) {
                      return this.buildAutomationKpiFallback(filter);
                    }
                    return throwError(() => lastResortErr);
                  })
                );
              }
              if (this.shouldFallbackToWeeklyStatus(fallbackErr)) {
                return this.buildAutomationKpiFallback(filter);
              }
              return throwError(() => fallbackErr);
            })
          );
        }
        if (this.shouldFallbackToWeeklyStatus(err)) {
          return this.buildAutomationKpiFallback(filter);
        }
        return throwError(() => err);
      })
    );
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

  private fetchWeeklyStatus(filter: WeeklyStatusFilter, url: string): Observable<WeeklyStatusResponse> {
    return this.getJson<WeeklyStatusResponse>(url, {
      weekStart: filter.weekStart,
      weekEnd: filter.weekEnd,
      platform: filter.platform || '',
      suite: filter.suite || '',
      executionType: filter.executionType || ''
    });
  }

  private fetchWeeklyStatusFromResultRuns(filter: WeeklyStatusFilter): Observable<WeeklyStatusResponse> {
    return this.getJson<WeeklyStatusResponse>(this.resultRunsUrl, {
      view: 'weekly-status',
      weekStart: filter.weekStart,
      weekEnd: filter.weekEnd,
      platform: filter.platform || '',
      suite: filter.suite || '',
      executionType: filter.executionType || ''
    });
  }

  private fetchAutomationKpi(filter: WeeklyStatusFilter, url: string): Observable<AutomationKpiResponse> {
    return this.getJson<AutomationKpiResponse>(url, {
      weekStart: filter.weekStart,
      weekEnd: filter.weekEnd,
      platform: filter.platform || '',
      suite: filter.suite || '',
      executionType: filter.executionType || ''
    });
  }

  private fetchAutomationKpiFromResultRuns(filter: WeeklyStatusFilter): Observable<AutomationKpiResponse> {
    return this.getJson<AutomationKpiResponse>(this.resultRunsUrl, {
      view: 'automation-kpi',
      weekStart: filter.weekStart,
      weekEnd: filter.weekEnd,
      platform: filter.platform || '',
      suite: filter.suite || '',
      executionType: filter.executionType || ''
    });
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

    const contentType = response.headers.get('content-type') || '';
    try {
      return JSON.parse(rawBody) as T;
    } catch {
      throw this.createUnexpectedResponseError(response.status, rawBody, contentType, response.url || urlOrUnknown());
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
          const message = this.buildUnexpectedResponseMessage(rawBody, err.headers?.get('content-type') || '', err.url || urlOrUnknown());
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
        message:
          typeof err.message === 'string' && err.message.includes('Http failure during parsing')
            ? this.buildUnexpectedResponseMessage('', err.headers?.get('content-type') || '', err.url || urlOrUnknown())
            : err.message
      };
    }

    return {
      status: 0,
      error: err,
      message: err instanceof Error ? err.message : 'Unexpected weekly status error'
    };
  }

  private createUnexpectedResponseError(
    status: number,
    rawBody: string,
    contentType: string,
    url: string
  ): { status: number; error: string; message: string; url: string; contentType: string } {
    const message = this.buildUnexpectedResponseMessage(rawBody, contentType, url);
    return {
      status,
      error: rawBody,
      message,
      url,
      contentType
    };
  }

  private buildUnexpectedResponseMessage(rawBody: string, contentType: string, url: string): string {
    const normalizedBody = rawBody.toLowerCase();
    const normalizedType = String(contentType || '').toLowerCase();
    const endpointLabel = this.describeAutomationEndpoint(url);
    const looksLikeHtml =
      normalizedType.includes('text/html') ||
      normalizedBody.startsWith('<!doctype') ||
      normalizedBody.startsWith('<html');
    const looksLikeAngularShell =
      looksLikeHtml &&
      (normalizedBody.includes('<app-root') ||
        normalizedBody.includes('<base href=') ||
        normalizedBody.includes('loading nbcuniversal'));

    if (looksLikeAngularShell) {
      return `The ${endpointLabel} returned the frontend app shell instead of JSON for ${url}. This usually means the reverse proxy is routing the API request to index.html instead of the backend service.`;
    }

    if (looksLikeHtml) {
      return `The ${endpointLabel} returned HTML instead of JSON for ${url}. Please verify the reverse proxy and backend routing for this API path.`;
    }

    return `The ${endpointLabel} returned invalid JSON.`;
  }

  private describeAutomationEndpoint(url: string): string {
    if (url.includes('/api/automation/kpi')) {
      return 'automation KPI API';
    }
    if (url.includes('/api/automation/weekly-status')) {
      return 'weekly status API';
    }
    return 'automation API';
  }

  private shouldFallbackToWeeklyStatus(err: unknown): boolean {
    const status = Number((err as { status?: number } | null)?.status ?? 0);
    const message = String((err as { message?: string } | null)?.message ?? '').toLowerCase();

    if (status === 404) {
      return true;
    }

    return (
      message.includes('frontend app shell instead of json') ||
      message.includes('returned html instead of json')
    );
  }

  private shouldTryAlternateApi(err: unknown): boolean {
    const status = Number((err as { status?: number } | null)?.status ?? 0);
    const message = String((err as { message?: string } | null)?.message ?? '').toLowerCase();

    if (status === 404) {
      return true;
    }

    return (
      message.includes('frontend app shell instead of json') ||
      message.includes('returned html instead of json')
    );
  }

  private buildAutomationKpiFallback(filter: WeeklyStatusFilter): Observable<AutomationKpiResponse> {
    const previousAnchor = new Date(`${filter.weekStart}T12:00:00`);
    if (Number.isNaN(previousAnchor.getTime())) {
      return throwError(() => ({
        status: 500,
        error: null,
        message: 'Unable to derive the previous working week for KPI fallback.'
      }));
    }

    previousAnchor.setDate(previousAnchor.getDate() - 7);
    const previousRange = getWorkingWeekRange(previousAnchor);

    return forkJoin({
      currentBoard: this.getWeeklyStatus(filter),
      previousBoard: this.getWeeklyStatus({
        weekStart: previousRange.weekStart,
        weekEnd: previousRange.weekEnd,
        platform: filter.platform,
        suite: filter.suite,
        executionType: filter.executionType
      })
    }).pipe(
      map(({ currentBoard, previousBoard }) => buildAutomationKpiResponseFromWeeklyBoards(currentBoard, previousBoard))
    );
  }
}

function urlOrUnknown(): string {
  return '/api/automation/weekly-status';
}
