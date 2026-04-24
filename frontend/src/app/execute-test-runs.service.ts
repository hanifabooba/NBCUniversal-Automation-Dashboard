import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type ExecuteRunType = 'tag' | 'test-cases';

export interface SharedExecuteTestRun {
  id: number;
  status: string;
  who: string;
  when: string;
  date: string;
  env: string;
  feature: string;
  displayLabel: string;
  runType: ExecuteRunType;
  featureFiles?: string[];
  browser?: string;
  deviceType?: string;
  branch?: string;
  comment?: string;
  jira?: string;
  queueUrl?: string;
  buildUrl?: string;
  buildNumber?: number;
  queueId?: number;
  note?: string;
  prefix?: string;
  testJsonUrl?: string;
  resultUrl?: string;
  artifactError?: string;
  createdAtIso?: string;
  weeklyExecutionId?: string;
}

@Injectable({ providedIn: 'root' })
export class ExecuteTestRunsService {
  constructor(private http: HttpClient) {}

  listRuns(limit = 20): Observable<SharedExecuteTestRun[]> {
    return this.http.get<SharedExecuteTestRun[]>('/api/execute-test-runs', {
      params: { limit: String(limit) }
    });
  }

  upsertRun(run: SharedExecuteTestRun): Observable<SharedExecuteTestRun> {
    return this.http.post<SharedExecuteTestRun>('/api/execute-test-runs', run);
  }
}
