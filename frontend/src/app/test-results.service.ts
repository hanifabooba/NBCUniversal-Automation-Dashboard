import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TestLog {
  timestamp?: string;
  status?: string;
  details?: string;
  seq?: number;
  media?: {
    path?: string;
  };
}

export interface TestResult {
  useNaturalConf?: boolean;
  startTime?: string;
  endTime?: string;
  status: 'PASS' | 'FAIL' | string;
  level?: number;
  isLeaf?: boolean;
  name: string;
  infoMap?: Record<string, unknown>;
  children?: TestResult[];
  logs?: TestLog[];
  media?: unknown[];
  exceptions?: unknown[];
  authorSet?: { name: string }[];
  categorySet?: { name: string }[];
  deviceSet?: { name?: string }[];
  generatedLog?: unknown[];
}

export interface RunSummary {
  id?: string;
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  createdAt?: string;
}

export interface ResultRun {
  id: string;
  name: string;
  key?: string;
  resultUrl?: string;
  data?: TestResult[];
  createdAt?: string;
  expiresAt?: string;
  hasResultHtml?: boolean;
  hasReportZip?: boolean;
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
}

@Injectable({ providedIn: 'root' })
export class TestResultsService {
  private readonly source = 'assets/test.json';

  constructor(private http: HttpClient) {}

  load(): Observable<TestResult[]> {
    return this.http.get<TestResult[]>(this.source);
  }

  getRunSummaries(): Observable<RunSummary[]> {
    return this.http.get<RunSummary[]>('/api/test-runs');
  }

  saveRunSummary(summary: RunSummary): Observable<RunSummary> {
    return this.http.post<RunSummary>('/api/test-runs', summary);
  }

  fetchRemoteJson(key: string): Observable<any> {
    return this.http.post('/api/results/fetch-json', { key });
  }

  getLatestCachedJson(): Observable<any> {
    return this.http.get('/api/results/latest-json');
  }

  getResultLink(key: string): Observable<{ key: string; url: string }> {
    return this.http.get<{ key: string; url: string }>('/api/results/result-url', { params: { key } });
  }

  getResultRuns(): Observable<ResultRun[]> {
    return this.http.get<ResultRun[]>('/api/result-runs');
  }

  loadRunData(key: string): Observable<{ data: TestResult[]; key: string; resultUrl?: string }> {
    return this.http.post<{ data: TestResult[]; key: string; resultUrl?: string }>('/api/results/fetch-json', { key });
  }

  uploadRunData(payload: { data: TestResult[] | string; key?: string; resultUrl?: string; name?: string }): Observable<{
    saved: boolean;
    key: string;
    resultUrl?: string;
    runId?: string;
    count?: number;
  }> {
    return this.http.post<{ saved: boolean; key: string; resultUrl?: string; runId?: string; count?: number }>(
      '/api/results/upload-json',
      payload
    );
  }

  saveResultRun(payload: Partial<ResultRun> & { key?: string; data?: TestResult[] }): Observable<ResultRun> {
    return this.http.post<ResultRun>('/api/result-runs', payload);
  }
}
