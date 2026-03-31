export type WeeklyPlatformFilter = 'ALL' | 'WEB' | 'MOBILE_WEB' | 'IOS';
export type WeeklySuiteFilter = 'ALL' | 'SANITY' | 'REGRESSION' | 'UNIFIED';
export type WeeklyExecutionTypeFilter = 'ALL' | 'WEEKLY' | 'ON_DEMAND';
export type WeeklyJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'NOT_RUN';

export interface WorkingWeekRange {
  monday: Date;
  friday: Date;
  weekStart: string;
  weekEnd: string;
  label: string;
}

export interface WeeklyStatusFilter {
  weekStart: string;
  weekEnd: string;
  platform?: WeeklyPlatformFilter;
  suite?: WeeklySuiteFilter;
  executionType?: WeeklyExecutionTypeFilter;
}

export interface WeeklyStatusSummary {
  totalAutomated: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface WeeklyStatusBoardRow {
  id: string;
  sn: number;
  platform: string;
  suite: string;
  testCases: number;
  applicationCoverage?: number | null;
  automationScripts: number;
  coveragePercent: number;
  execution: WeeklyExecutionTypeFilter | '—';
  passed: number;
  failed: number;
  passingRate: number;
  executedWeek: string;
  resultsLink?: string;
  jobStatus: string;
  label: string;
  executedAt?: string;
}

export interface WeeklyStatusResponse {
  weekStart: string;
  weekEnd: string;
  label: string;
  summary: WeeklyStatusSummary;
  rows: WeeklyStatusBoardRow[];
}

export interface WeeklyExecutionUpsertPayload {
  id?: string;
  boardId?: string;
  jobId?: string;
  label?: string;
  tag?: string;
  environment?: string;
  browser?: string;
  deviceType?: string;
  executionType?: Exclude<WeeklyExecutionTypeFilter, 'ALL'>;
  status?: WeeklyJobStatus;
  executedAt?: string;
  executedWeekStart?: string;
  executedWeekEnd?: string;
  totalAutomated?: number;
  passed?: number;
  failed?: number;
  passRate?: number;
  resultsLink?: string;
  queueId?: number;
  queueUrl?: string;
  buildUrl?: string;
  buildNumber?: number;
  runPrefix?: string;
  errorMessage?: string;
}
