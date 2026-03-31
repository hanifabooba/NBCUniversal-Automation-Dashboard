import { WeeklyExecutionTypeFilter, WeeklyPlatformFilter, WeeklySuiteFilter } from './weekly-status.models';

export interface WeeklyJobButton {
  id: string;
  label: string;
}

export const WEEKLY_PLATFORM_OPTIONS: Array<{ label: string; value: WeeklyPlatformFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Web', value: 'WEB' },
  { label: 'Mobile Web', value: 'MOBILE_WEB' },
  { label: 'iOS', value: 'IOS' }
];

export const WEEKLY_SUITE_OPTIONS: Array<{ label: string; value: WeeklySuiteFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Sanity', value: 'SANITY' },
  { label: 'Regression', value: 'REGRESSION' },
  { label: 'Unified', value: 'UNIFIED' }
];

export const WEEKLY_EXECUTION_OPTIONS: Array<{ label: string; value: WeeklyExecutionTypeFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'On Demand', value: 'ON_DEMAND' }
];

export const WEEKLY_JOB_BUTTONS: WeeklyJobButton[] = [
  { id: 'dw-sanity', label: 'Desktop Web Sanity' },
  { id: 'dw-regression', label: 'Desktop Web Regression' },
  { id: 'mw-sanity', label: 'Mobile Web Sanity' },
  { id: 'mw-regression', label: 'Mobile Web Regression' }
];
