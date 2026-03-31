export type WeeklyPlatform = 'WEB' | 'MOBILE_WEB' | 'IOS';
export type WeeklySuite = 'SANITY' | 'REGRESSION' | 'UNIFIED';
export type WeeklyExecutionType = 'WEEKLY' | 'ON_DEMAND';
export type WeeklyJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'NOT_RUN';

export interface WeeklyBoardDefinition {
  id: string;
  sn: number;
  platform: WeeklyPlatform;
  platformLabel: string;
  suite: WeeklySuite;
  suiteLabel: string;
  testCases: number;
  applicationCoverage?: number | null;
  automationScripts: number;
  coveragePercent: number;
  supportedExecutionTypes: WeeklyExecutionType[];
  tagAliases: string[];
}

export interface WeeklyAutomationJobDefinition {
  id: string;
  boardId: string;
  label: string;
  platform: WeeklyPlatform;
  suite: WeeklySuite;
  tag: string;
  environment: string;
  browser: string;
  deviceType: string;
  executionType: WeeklyExecutionType;
  active: boolean;
}

export interface WorkingWeekRange {
  monday: Date;
  friday: Date;
  weekStart: string;
  weekEnd: string;
  label: string;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(monday: Date, friday: Date): string {
  const sameYear = monday.getFullYear() === friday.getFullYear();
  const sameMonth = sameYear && monday.getMonth() === friday.getMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monday);
    return `${month} ${monday.getDate()} - ${friday.getDate()}, ${monday.getFullYear()}`;
  }

  if (sameYear) {
    const start = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(monday);
    const end = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(friday);
    return `${start} - ${end}, ${monday.getFullYear()}`;
  }

  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt.format(monday)} - ${fmt.format(friday)}`;
}

export function getWorkingWeekRange(inputDate: Date): WorkingWeekRange {
  const date = new Date(inputDate);
  const day = date.getDay();
  const normalized = new Date(date);

  if (day === 6) {
    normalized.setDate(date.getDate() - 1);
  } else if (day === 0) {
    normalized.setDate(date.getDate() - 2);
  }

  const currentDay = normalized.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(normalized);
  monday.setDate(normalized.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return {
    monday,
    friday,
    weekStart: formatDateOnly(monday),
    weekEnd: formatDateOnly(friday),
    label: formatWeekLabel(monday, friday)
  };
}

export function resolveWorkingWeekRange(weekStart?: string, weekEnd?: string): WorkingWeekRange {
  if (weekStart && weekEnd) {
    const monday = new Date(`${weekStart}T00:00:00`);
    const friday = new Date(`${weekEnd}T23:59:59.999`);
    if (!Number.isNaN(monday.getTime()) && !Number.isNaN(friday.getTime())) {
      return {
        monday,
        friday,
        weekStart,
        weekEnd,
        label: formatWeekLabel(monday, friday)
      };
    }
  }
  return getWorkingWeekRange(new Date());
}

export const WEEKLY_STATUS_BOARD_DEFINITIONS: WeeklyBoardDefinition[] = [
  {
    id: 'web-sanity',
    sn: 1,
    platform: 'WEB',
    platformLabel: 'Web',
    suite: 'SANITY',
    suiteLabel: 'Sanity',
    testCases: 36,
    applicationCoverage: 45,
    automationScripts: 27,
    coveragePercent: 75,
    supportedExecutionTypes: ['WEEKLY', 'ON_DEMAND'],
    tagAliases: ['@dw_sanity']
  },
  {
    id: 'web-regression',
    sn: 1,
    platform: 'WEB',
    platformLabel: 'Web',
    suite: 'REGRESSION',
    suiteLabel: 'Regression + FAST',
    testCases: 155,
    applicationCoverage: 85,
    automationScripts: 107,
    coveragePercent: 69.03,
    supportedExecutionTypes: ['WEEKLY', 'ON_DEMAND'],
    tagAliases: ['@dwdesktopweb_regression', '@dw_regression']
  },
  {
    id: 'web-unified',
    sn: 1,
    platform: 'WEB',
    platformLabel: 'Web',
    suite: 'UNIFIED',
    suiteLabel: 'Unified',
    testCases: 25,
    applicationCoverage: null,
    automationScripts: 20,
    coveragePercent: 80,
    supportedExecutionTypes: ['ON_DEMAND'],
    tagAliases: ['@dw_testrunner']
  },
  {
    id: 'mobile-web-sanity',
    sn: 2,
    platform: 'MOBILE_WEB',
    platformLabel: 'Mobile Web',
    suite: 'SANITY',
    suiteLabel: 'Sanity',
    testCases: 35,
    applicationCoverage: 45,
    automationScripts: 35,
    coveragePercent: 100,
    supportedExecutionTypes: ['WEEKLY', 'ON_DEMAND'],
    tagAliases: ['@mw_sanity']
  },
  {
    id: 'mobile-web-regression',
    sn: 2,
    platform: 'MOBILE_WEB',
    platformLabel: 'Mobile Web',
    suite: 'REGRESSION',
    suiteLabel: 'Regression',
    testCases: 159,
    applicationCoverage: 85,
    automationScripts: 141,
    coveragePercent: 88.68,
    supportedExecutionTypes: ['WEEKLY', 'ON_DEMAND'],
    tagAliases: ['@mw_regression']
  },
  {
    id: 'mobile-web-unified',
    sn: 2,
    platform: 'MOBILE_WEB',
    platformLabel: 'Mobile Web',
    suite: 'UNIFIED',
    suiteLabel: 'Unified',
    testCases: 15,
    applicationCoverage: null,
    automationScripts: 13,
    coveragePercent: 86.67,
    supportedExecutionTypes: ['ON_DEMAND'],
    tagAliases: ['@mw_testrunner']
  },
  {
    id: 'ios-sanity',
    sn: 3,
    platform: 'IOS',
    platformLabel: 'iOS',
    suite: 'SANITY',
    suiteLabel: 'Sanity',
    testCases: 50,
    applicationCoverage: 45,
    automationScripts: 36,
    coveragePercent: 72,
    supportedExecutionTypes: ['ON_DEMAND'],
    tagAliases: ['@ios_sanity']
  },
  {
    id: 'ios-regression',
    sn: 3,
    platform: 'IOS',
    platformLabel: 'iOS',
    suite: 'REGRESSION',
    suiteLabel: 'Regression',
    testCases: 178,
    applicationCoverage: 90,
    automationScripts: 130,
    coveragePercent: 73.03,
    supportedExecutionTypes: ['ON_DEMAND'],
    tagAliases: ['@ios_regression']
  }
];

export const WEEKLY_AUTOMATION_JOBS: WeeklyAutomationJobDefinition[] = [
  {
    id: 'dw-sanity',
    boardId: 'web-sanity',
    label: 'Desktop Web Sanity',
    platform: 'WEB',
    suite: 'SANITY',
    tag: '@DW_sanity',
    environment: 'Production',
    browser: 'chrome',
    deviceType: 'Desktop_Web',
    executionType: 'WEEKLY',
    active: true
  },
  {
    id: 'dw-regression',
    boardId: 'web-regression',
    label: 'Desktop Web Regression',
    platform: 'WEB',
    suite: 'REGRESSION',
    tag: '@DWDesktopWeb_Regression',
    environment: 'Production',
    browser: 'chrome',
    deviceType: 'Desktop_Web',
    executionType: 'WEEKLY',
    active: true
  },
  {
    id: 'mw-sanity',
    boardId: 'mobile-web-sanity',
    label: 'Mobile Web Sanity',
    platform: 'MOBILE_WEB',
    suite: 'SANITY',
    tag: '@MW_sanity',
    environment: 'Production',
    browser: 'chrome',
    deviceType: 'Mobile_Web',
    executionType: 'WEEKLY',
    active: true
  },
  {
    id: 'mw-regression',
    boardId: 'mobile-web-regression',
    label: 'Mobile Web Regression',
    platform: 'MOBILE_WEB',
    suite: 'REGRESSION',
    tag: '@MW_regression',
    environment: 'Production',
    browser: 'chrome',
    deviceType: 'Mobile_Web',
    executionType: 'WEEKLY',
    active: true
  }
];

function normalizeTag(tag?: string | null): string {
  return String(tag || '').trim().toLowerCase();
}

function inferPlatform(tag: string, deviceType?: string | null): WeeklyPlatform {
  const normalizedDevice = String(deviceType || '').toLowerCase();
  if (tag.includes('ios')) return 'IOS';
  if (tag.includes('@mw') || normalizedDevice.includes('mobile')) return 'MOBILE_WEB';
  return 'WEB';
}

function inferSuite(tag: string): WeeklySuite {
  if (tag.includes('regression')) return 'REGRESSION';
  if (tag.includes('sanity')) return 'SANITY';
  return 'UNIFIED';
}

export function findWeeklyBoardDefinitionById(boardId?: string | null): WeeklyBoardDefinition | undefined {
  return WEEKLY_STATUS_BOARD_DEFINITIONS.find(def => def.id === boardId);
}

export function findWeeklyJobDefinitionById(jobId?: string | null): WeeklyAutomationJobDefinition | undefined {
  return WEEKLY_AUTOMATION_JOBS.find(job => job.id === jobId);
}

export function findWeeklyBoardDefinitionByTag(tag?: string | null, deviceType?: string | null): WeeklyBoardDefinition | undefined {
  const normalizedTag = normalizeTag(tag);
  if (!normalizedTag) return undefined;

  const aliasMatch = WEEKLY_STATUS_BOARD_DEFINITIONS.find(def =>
    def.tagAliases.some(alias => normalizeTag(alias) === normalizedTag)
  );
  if (aliasMatch) return aliasMatch;

  const platform = inferPlatform(normalizedTag, deviceType);
  const suite = inferSuite(normalizedTag);
  return WEEKLY_STATUS_BOARD_DEFINITIONS.find(def => def.platform === platform && def.suite === suite);
}
