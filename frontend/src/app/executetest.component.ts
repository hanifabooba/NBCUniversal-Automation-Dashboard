import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  JenkinsFeatureFilesTriggerRequest,
  JenkinsOnDemandTestCaseRequest,
  JenkinsService,
  JenkinsTriggerRequest,
  JenkinsTriggerResponse
} from './jenkins.service';
import { TestResultsService } from './test-results.service';
import { ReleaseService } from './release.service';
import { WeeklyJobStatus } from './weekly-status.models';
import { WeeklyStatusService } from './weekly-status.service';

type ExecuteRunType = 'tag' | 'test-cases';

interface ExecuteRun {
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
  fetchingArtifacts?: boolean;
  artifactError?: string;
  createdAtIso?: string;
  weeklyExecutionId?: string;
}

@Component({
  standalone: true,
  selector: 'app-executetest',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './executetest.component.html',
  styleUrls: ['./executetest.component.css']
})
export class ExecuteTestComponent {
  readonly defaultAutomationBranch = 'Centralized_Web_And_Mobile_Final_Enterprise';
  jenkinsEnvironments = ['Production', 'Preprod', 'Stage'];
  jenkinsBrowsers = ['chrome', 'firefox', 'MicrosoftEdge'];
  deviceTypes = ['Desktop_Web', 'Mobile_Web'];
  jenkinsFeatures = [
    '@dw_smoke',
    '@mw_smoke',
    '@mw_testRunner',
    '@dw_testRunner',
    '@mw_regression',
    '@dw_regression',
    '@mw_sanity',
    '@dw_sanity',
    '@mw_home_page',
    '@dw_home_page',
    '@mw_home_page_weather_module',
    '@dw_home_page_weather_module',
    '@mw_home_page_ads',
    '@dw_home_page_ads',
    '@mw_home_page_video_play',
    '@dw_home_page_video_play',
    '@mw_home_page_tentpole_event',
    '@dw_home_page_tentpole_event',
    '@mw_header',
    '@dw_header',
    '@mw_footer',
    '@dw_footer',
    '@mw_hamburger_menu',
    '@dw_hamburger_menu',
    '@mw_contact_Us_page',
    '@dw_contact_Us_page',
    '@mw_weather',
    '@dw_weather',
    '@mw_section_and_tag_pages',
    '@dw_section_and_tag_pages',
    '@mw_articles',
    '@dw_articles',
    '@mw_CNBC_money_report_feature_article_page',
    '@dw_CNBC_money_report_feature_article_page',
    '@mw_branch_Banner',
    '@dw_branch_Banner',
    '@mw_border_traffic_module',
    '@dw_border_traffic_module',
    '@mw_video_hub',
    '@dw_video_hub',
    '@mw_live_video',
    '@dw_live_video',
    '@mw_live_TV',
    '@dw_live_TV',
    '@mw_gallery',
    '@dw_gallery',
    '@mw_breaking_alerts',
    '@dw_breaking_alerts',
    '@mw_traffic_page',
    '@dw_traffic_page',
    '@mw_products_page',
    '@dw_products_page',
    '@mw_newsletters',
    '@dw_newsletters',
    '@mw_forms',
    '@dw_forms',
    '@mw_home_page_countdown_module',
    '@dw_home_page_countdown_module',
    '@mw_404_error_page_to_category_path_URL',
    '@dw_404_error_page_to_category_path_URL',
    '@mw_default_thumbnail',
    '@dw_default_thumbnail',
    '@mw_front_end_search_page',
    '@dw_front_end_search_page',
    '@mw_fast',
    '@dw_fast'
  ];

  readonly maxOnDemandFeatureFiles = 20;
  readonly onDemandAppFolders = ['nbc_WP', 'nbc_mobweb'];
  readonly onDemandSuiteFolders = ['Regression', 'Sanity', 'Unified'];

  selectedEnv = 'Preprod';
  selectedBrowser = 'chrome';
  selectedDeviceTypes: string[] = ['Desktop_Web'];
  selectedFeature = '@dw_smoke';
  qaUser = '';
  comment = '';
  jiraTicket = '';
  suiteTriggerStatus = '';
  jenkinsBusy = false;

  onDemandSelectedEnv = 'Preprod';
  onDemandSelectedBrowser = 'chrome';
  onDemandSelectedDeviceTypes: string[] = ['Desktop_Web'];
  onDemandBranch = this.defaultAutomationBranch;
  onDemandTestCases: JenkinsOnDemandTestCaseRequest[] = [
    { appFolder: 'nbc_WP', suiteFolder: 'Regression', fileName: '' }
  ];
  onDemandQaUser = '';
  onDemandComment = '';
  onDemandJiraTicket = '';
  onDemandTriggerStatus = '';
  onDemandBusy = false;

  jenkinsStatus = '';
  expandedRunId: number | null = null;
  recentRuns: ExecuteRun[] = [];
  private pollHandle: any;

  constructor(
    private jenkins: JenkinsService,
    private testResults: TestResultsService,
    private releases: ReleaseService,
    private weeklyStatus: WeeklyStatusService
  ) {}

  get totalTrackedRuns(): number {
    return this.recentRuns.length;
  }

  get activeRuns(): number {
    return this.recentRuns.filter(run => this.isActiveStatus(run?.status)).length;
  }

  get completedRuns(): number {
    return this.recentRuns.filter(run => ['completed', 'success'].includes(String(run?.status || '').toLowerCase())).length;
  }

  get failedRuns(): number {
    return this.recentRuns.filter(run => ['failure', 'failed', 'cancelled', 'aborted'].includes(String(run?.status || '').toLowerCase())).length;
  }

  get suiteRunCount(): number {
    return this.recentRuns.filter(run => run.runType === 'tag').length;
  }

  get onDemandRunCount(): number {
    return this.recentRuns.filter(run => run.runType === 'test-cases').length;
  }

  get latestRun(): ExecuteRun | null {
    return this.recentRuns[0] ?? null;
  }

  triggerJenkins(): void {
    this.suiteTriggerStatus = '';
    this.jenkinsBusy = true;

    const deviceType = this.currentDeviceType(this.selectedDeviceTypes);
    const payload: JenkinsTriggerRequest = {
      environment: this.selectedEnv,
      featureTag: this.selectedFeature,
      browser: this.selectedBrowser,
      deviceType
    };

    this.jenkins.triggerBuild(payload).subscribe({
      next: res => {
        this.jenkinsBusy = false;
        this.suiteTriggerStatus = this.buildTriggerStatus(res);

        const userComment = this.comment.trim();
        const userJira = this.jiraTicket.trim();
        const userName = this.qaUser.trim() || 'Manual QA';
        const run = this.addTriggeredRun({
          response: res,
          runType: 'tag',
          who: userName,
          env: this.selectedEnv,
          feature: this.selectedFeature,
          browser: this.selectedBrowser,
          deviceType,
          comment: userComment,
          jira: userJira
        });

        this.syncRunToWeeklyBoard(run);
        this.qaUser = '';
        this.comment = '';
        this.jiraTicket = '';
      },
      error: err => {
        this.jenkinsBusy = false;
        const detail = err?.error?.message || err?.message || 'Unknown error';
        this.suiteTriggerStatus = `Failed to trigger Jenkins: ${detail}`;
      }
    });
  }

  triggerFeatureFilesOnDemand(): void {
    this.onDemandTriggerStatus = '';

    const branch = this.onDemandBranch.trim();
    if (!branch) {
      this.onDemandTriggerStatus = 'Branch is required.';
      return;
    }

    const prepared = this.prepareOnDemandSelections();
    if (prepared.error || !prepared.testCases || !prepared.featurePaths) {
      this.onDemandTriggerStatus = prepared.error || 'Provide at least one test case.';
      return;
    }

    this.onDemandBusy = true;
    const deviceType = this.currentDeviceType(this.onDemandSelectedDeviceTypes);
    const payload: JenkinsFeatureFilesTriggerRequest = {
      environment: this.onDemandSelectedEnv,
      browser: this.onDemandSelectedBrowser,
      branch,
      testCases: prepared.testCases,
      deviceType
    };

    this.jenkins.triggerFeatureFilesBuild(payload).subscribe({
      next: res => {
        this.onDemandBusy = false;
        this.onDemandTriggerStatus = this.buildTriggerStatus(res);

        const userComment = this.onDemandComment.trim();
        const userJira = this.onDemandJiraTicket.trim();
        const userName = this.onDemandQaUser.trim() || 'Manual QA';
        const resolvedPaths = res.featureFiles?.length ? res.featureFiles : prepared.featurePaths;

        this.addTriggeredRun({
          response: res,
          runType: 'test-cases',
          who: userName,
          env: this.onDemandSelectedEnv,
          feature: this.buildFeatureFilesLabel(prepared.testCases.map(testCase => testCase.fileName)),
          featureFiles: resolvedPaths,
          branch: res.branch || branch,
          browser: this.onDemandSelectedBrowser,
          deviceType,
          comment: userComment,
          jira: userJira
        });

        this.onDemandQaUser = '';
        this.onDemandComment = '';
        this.onDemandJiraTicket = '';
        this.resetOnDemandTestCases();
      },
      error: err => {
        this.onDemandBusy = false;
        const detail = err?.error?.message || err?.message || 'Unknown error';
        this.onDemandTriggerStatus = `Failed to trigger test cases: ${detail}`;
      }
    });
  }

  ngOnInit(): void {
    this.loadRuns();
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
  }

  addOnDemandTestCaseRow(): void {
    if (this.onDemandTestCases.length >= this.maxOnDemandFeatureFiles) return;
    this.onDemandTestCases = [...this.onDemandTestCases, this.createEmptyOnDemandTestCase()];
  }

  removeOnDemandTestCaseRow(index: number): void {
    if (this.onDemandTestCases.length === 1) {
      this.resetOnDemandTestCases();
      return;
    }
    this.onDemandTestCases = this.onDemandTestCases.filter((_row, rowIndex) => rowIndex !== index);
  }

  onDemandSelectionCount(): number {
    return this.previewOnDemandFeaturePaths().length;
  }

  onDemandPathPreview(testCase: JenkinsOnDemandTestCaseRequest): string {
    const fileName = String(testCase.fileName || '').trim() || '<feature-file>.feature';
    return this.buildFeatureRelativePath({
      appFolder: String(testCase.appFolder || '').trim() || this.onDemandAppFolders[0],
      suiteFolder: String(testCase.suiteFolder || '').trim() || this.onDemandSuiteFolders[0],
      fileName
    });
  }

  toggleDeviceType(type: string, target: ExecuteRunType): void {
    if (!type) return;
    if (target === 'tag') {
      this.selectedDeviceTypes = [type];
      return;
    }
    this.onDemandSelectedDeviceTypes = [type];
  }

  runTypeLabel(run: ExecuteRun): string {
    return run.runType === 'test-cases' ? 'Test cases on demand' : 'Tag-based suite';
  }

  runStatusBadgeClass(status: string | undefined): string {
    const normalized = String(status || '').toLowerCase();
    if (['pending', 'queued'].includes(normalized)) return 'text-bg-warning';
    if (['inprogress', 'in-progress', 'running', 'triggered'].includes(normalized)) return 'text-bg-info';
    if (['completed', 'success'].includes(normalized)) return 'text-bg-success';
    if (['failure', 'failed', 'cancelled', 'aborted'].includes(normalized)) return 'text-bg-danger';
    return 'text-bg-secondary';
  }

  refreshBoard(): void {
    this.loadRuns();
    this.pollActiveRuns();
  }

  toggleRunDetails(run: ExecuteRun): void {
    if (!run) return;
    this.expandedRunId = this.expandedRunId === run.id ? null : run.id;
  }

  isRunExpanded(run: ExecuteRun): boolean {
    return !!run && this.expandedRunId === run.id;
  }

  private startPolling(): void {
    this.pollHandle = setInterval(() => {
      this.pollActiveRuns();
    }, 5000);
  }

  private pollActiveRuns(): void {
    this.recentRuns.forEach(run => {
      if (run.status === 'queued' && run.queueId) {
        this.jenkins.getQueueInfo(run.queueId).subscribe({
          next: info => {
            if (info.cancelled) run.status = 'cancelled';
            if (info.executable?.url) {
              run.buildUrl = info.executable.url;
              run.buildNumber = info.executable.number;
              run.status = 'running';
            }
            this.syncRunToWeeklyBoard(run);
            this.saveRuns();
            this.updateBannerStatus();
          },
          error: () => {
            // ignore transient errors
          }
        });
      } else if (run.status === 'running' && run.buildUrl) {
        this.jenkins.getBuildInfo(run.buildUrl).subscribe({
          next: build => {
            const prefix = this.extractPrefix(build);
            if (prefix) run.prefix = prefix;

            if (build.building) {
              run.status = 'running';
            } else if (build.result) {
              const result = build.result.toLowerCase();
              run.status = result === 'success' ? 'completed' : result;
              if (run.prefix && !run.testJsonUrl && !run.fetchingArtifacts) {
                this.fetchArtifacts(run);
              }
            }
            this.syncRunToWeeklyBoard(run);
            this.saveRuns();
            this.updateBannerStatus();
          },
          error: () => {
            // ignore transient errors
          }
        });
      } else if (run.status === 'completed' && run.buildUrl && !run.prefix) {
        this.jenkins.getBuildInfo(run.buildUrl).subscribe({
          next: build => {
            const prefix = this.extractPrefix(build);
            if (prefix) {
              run.prefix = prefix;
              if (!run.testJsonUrl && !run.fetchingArtifacts) {
                this.fetchArtifacts(run);
              }
              this.saveRuns();
              this.updateBannerStatus();
            }
          },
          error: () => {
            // ignore
          }
        });
      }
    });
    this.updateBannerStatus();
  }

  cancelRun(run: ExecuteRun): void {
    if (run.status === 'completed' || run.status === 'failure' || run.status === 'failed') return;

    if (run.status === 'queued' && run.queueId) {
      this.jenkins.cancelQueue(run.queueId).subscribe({
        next: () => {
          run.status = 'cancelled';
          this.syncRunToWeeklyBoard(run, { status: 'FAILED', errorMessage: 'Run cancelled from dashboard.' });
          this.saveRuns();
          this.updateBannerStatus();
        },
        error: err => {
          run.note = err?.error?.message || 'Cancel failed';
        }
      });
    } else if (run.buildUrl && (run.status === 'running' || run.status === 'inprogress')) {
      this.jenkins.stopBuild(run.buildUrl).subscribe({
        next: () => {
          run.status = 'cancelled';
          this.syncRunToWeeklyBoard(run, { status: 'FAILED', errorMessage: 'Run stopped from dashboard.' });
          this.saveRuns();
          this.updateBannerStatus();
        },
        error: err => {
          run.note = err?.error?.message || 'Stop failed';
        }
      });
    }
  }

  private addTriggeredRun(input: {
    response: JenkinsTriggerResponse;
    runType: ExecuteRunType;
    who: string;
    env: string;
    feature: string;
    featureFiles?: string[];
    branch?: string;
    browser?: string;
    deviceType?: string;
    comment?: string;
    jira?: string;
  }): ExecuteRun {
    const now = new Date();
    const queueText = input.response.queueId ? ` (queue #${input.response.queueId})` : '';
    const createdAtIso = now.toISOString();
    const newRunId = input.response.queueId || Date.now();
    const displayLabel = input.feature;
    const featureFiles = input.featureFiles?.length ? input.featureFiles : undefined;

    const run: ExecuteRun = {
      id: newRunId,
      status: input.response.queued ? 'queued' : 'triggered',
      who: input.who,
      when: now.toLocaleTimeString(),
      date: now.toLocaleDateString(),
      env: input.env,
      feature: displayLabel,
      displayLabel,
      runType: input.runType,
      featureFiles,
      branch: input.branch,
      browser: input.browser,
      deviceType: input.deviceType,
      comment: input.comment || '',
      jira: input.jira || '',
      queueUrl: input.response.queueUrl,
      queueId: input.response.queueId,
      note: queueText || input.response.message || '',
      testJsonUrl: undefined,
      resultUrl: undefined,
      artifactError: undefined,
      createdAtIso,
      weeklyExecutionId: undefined
    };

    this.recentRuns.unshift(run);
    this.recentRuns = this.recentRuns.slice(0, 20);
    this.expandedRunId = newRunId;
    this.releases.add({
      id: newRunId,
      qa: input.who,
      feature: displayLabel,
      featureFiles,
      branch: input.branch,
      runType: input.runType,
      environment: input.env,
      comment: input.comment || '',
      jira: input.jira || '',
      stage: 'orders',
      createdAt: createdAtIso
    });
    this.saveRuns();
    this.updateBannerStatus();
    return run;
  }

  private saveRuns(): void {
    try {
      localStorage.setItem('jenkins-runs', JSON.stringify(this.recentRuns));
    } catch {
      // ignore storage errors
    }
  }

  private loadRuns(): void {
    try {
      const raw = localStorage.getItem('jenkins-runs');
      if (raw) {
        const parsed = JSON.parse(raw);
        this.recentRuns = Array.isArray(parsed) ? parsed.map(run => this.normalizeStoredRun(run)).slice(0, 20) : [];
      }
    } catch {
      this.recentRuns = [];
    }
    this.updateBannerStatus();
    this.ensureExpandedRun();
  }

  private normalizeStoredRun(raw: any): ExecuteRun {
    const featureFiles = Array.isArray(raw?.featureFiles)
      ? raw.featureFiles.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
      : undefined;
    const runType: ExecuteRunType = raw?.runType === 'test-cases' || (featureFiles?.length || 0) > 0 ? 'test-cases' : 'tag';
    const displayLabel =
      this.optionalString(raw?.displayLabel) ||
      this.optionalString(raw?.feature) ||
      (featureFiles?.length ? this.buildFeatureFilesLabel(featureFiles) : 'Unknown selection');

    return {
      id: this.optionalNumber(raw?.id) || Date.now(),
      status: String(raw?.status || 'unknown'),
      who: String(raw?.who || 'Manual QA'),
      when: String(raw?.when || ''),
      date: String(raw?.date || ''),
      env: String(raw?.env || ''),
      feature: displayLabel,
      displayLabel,
      runType,
      featureFiles,
      browser: this.optionalString(raw?.browser),
      deviceType: this.optionalString(raw?.deviceType),
      branch: this.optionalString(raw?.branch),
      comment: this.optionalString(raw?.comment),
      jira: this.optionalString(raw?.jira),
      queueUrl: this.optionalString(raw?.queueUrl),
      buildUrl: this.optionalString(raw?.buildUrl),
      buildNumber: this.optionalNumber(raw?.buildNumber),
      queueId: this.optionalNumber(raw?.queueId),
      note: this.optionalString(raw?.note),
      prefix: this.optionalString(raw?.prefix),
      testJsonUrl: this.optionalString(raw?.testJsonUrl),
      resultUrl: this.optionalString(raw?.resultUrl),
      fetchingArtifacts: Boolean(raw?.fetchingArtifacts),
      artifactError: this.optionalString(raw?.artifactError),
      createdAtIso: this.optionalString(raw?.createdAtIso),
      weeklyExecutionId: this.optionalString(raw?.weeklyExecutionId)
    };
  }

  private extractPrefix(build: any): string | null {
    if (build?.runPrefix) return build.runPrefix;
    if (Array.isArray(build?.parameters)) {
      const found = build.parameters.find((p: any) => p?.name === 'RUN_PREFIX' || p?.name === 'ARTIFACT_PREFIX');
      if (found?.value) return String(found.value);
    }
    return null;
  }

  private currentDeviceType(selectedDeviceTypes: string[]): string {
    const first = selectedDeviceTypes.find(Boolean);
    return first || 'Desktop_Web';
  }

  private prepareOnDemandSelections(): {
    error?: string;
    testCases?: JenkinsOnDemandTestCaseRequest[];
    featurePaths?: string[];
  } {
    const normalizedRows = this.onDemandTestCases
      .map(testCase => ({
        appFolder: String(testCase.appFolder || '').trim(),
        suiteFolder: String(testCase.suiteFolder || '').trim(),
        fileName: String(testCase.fileName || '').trim()
      }))
      .filter(testCase => testCase.fileName);

    if (!normalizedRows.length) {
      return { error: 'Provide at least one feature file name.' };
    }

    const deduped: JenkinsOnDemandTestCaseRequest[] = [];
    const seenPaths = new Set<string>();

    for (let index = 0; index < normalizedRows.length; index += 1) {
      const testCase = normalizedRows[index];
      const rowNumber = index + 1;

      if (!this.onDemandAppFolders.includes(testCase.appFolder)) {
        return { error: `Select a valid app folder for row ${rowNumber}.` };
      }
      if (!this.onDemandSuiteFolders.includes(testCase.suiteFolder)) {
        return { error: `Select a valid suite folder for row ${rowNumber}.` };
      }
      if (!testCase.fileName.toLowerCase().endsWith('.feature')) {
        return { error: `Feature file in row ${rowNumber} must end with .feature.` };
      }
      if (/[\\/]/.test(testCase.fileName) || testCase.fileName.includes('..')) {
        return { error: `Provide only the feature file name in row ${rowNumber}, not a path.` };
      }

      const relativePath = this.buildFeatureRelativePath(testCase);
      if (seenPaths.has(relativePath)) continue;
      seenPaths.add(relativePath);
      deduped.push(testCase);
    }

    if (!deduped.length) {
      return { error: 'Provide at least one unique test case.' };
    }
    if (deduped.length > this.maxOnDemandFeatureFiles) {
      return { error: `You can trigger at most ${this.maxOnDemandFeatureFiles} feature files at a time.` };
    }

    return {
      testCases: deduped,
      featurePaths: deduped.map(testCase => this.buildFeatureRelativePath(testCase))
    };
  }

  private previewOnDemandFeaturePaths(): string[] {
    const seenPaths = new Set<string>();
    const paths: string[] = [];

    for (const testCase of this.onDemandTestCases) {
      const fileName = String(testCase.fileName || '').trim();
      if (!fileName) continue;
      const path = this.buildFeatureRelativePath({
        appFolder: String(testCase.appFolder || '').trim() || this.onDemandAppFolders[0],
        suiteFolder: String(testCase.suiteFolder || '').trim() || this.onDemandSuiteFolders[0],
        fileName
      });
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      paths.push(path);
    }

    return paths;
  }

  private buildFeatureRelativePath(testCase: JenkinsOnDemandTestCaseRequest): string {
    return `src/test/resources/features/${testCase.appFolder}/${testCase.suiteFolder}/${testCase.fileName}`;
  }

  private buildFeatureFilesLabel(values: string[]): string {
    if (!values.length) return 'On-demand test cases';
    const preview = values.slice(0, 3).join(', ');
    const remaining = values.length - 3;
    return remaining > 0 ? `${preview} +${remaining} more` : preview;
  }

  private createEmptyOnDemandTestCase(): JenkinsOnDemandTestCaseRequest {
    return {
      appFolder: this.onDemandAppFolders[0],
      suiteFolder: this.onDemandSuiteFolders[0],
      fileName: ''
    };
  }

  private resetOnDemandTestCases(): void {
    this.onDemandTestCases = [this.createEmptyOnDemandTestCase()];
  }

  private buildTriggerStatus(response: JenkinsTriggerResponse): string {
    const queueText = response.queueId ? ` (queue #${response.queueId})` : '';
    return response.message || `Triggered${queueText}`;
  }

  private fetchArtifacts(run: ExecuteRun): void {
    if (!run.prefix) return;
    run.fetchingArtifacts = true;
    const prefix = String(run.prefix).replace(/\/+$/, '');
    const jsonKey = `${prefix}/test.json`;
    const htmlKey = `${prefix}/result.html`;

    this.testResults.fetchRemoteJson(jsonKey).subscribe({
      next: resp => {
        run.testJsonUrl = resp?.url;
        run.fetchingArtifacts = false;
        run.artifactError = undefined;
        this.releases.update(run.id, { testJsonUrl: run.testJsonUrl });
        if (resp?.data) {
          this.testResults.saveResultRun({
            name: jsonKey,
            key: jsonKey,
            data: resp.data,
            resultUrl: run.resultUrl
          }).subscribe({ next: () => {}, error: () => {} });
        }
        if (resp?.summary) {
          const passed = Number(resp.summary.passed || 0);
          const failed = Number(resp.summary.failed || 0);
          const total = Number(resp.summary.total || passed + failed);
          this.syncRunToWeeklyBoard(run, {
            totalAutomated: total,
            passed,
            failed,
            passRate: this.computePassRate(passed, failed),
            resultsLink: run.resultUrl,
            status: this.mapWeeklyStatus(run.status)
          });
        }
        this.saveRuns();
      },
      error: () => {
        run.fetchingArtifacts = false;
        run.artifactError = 'Could not fetch test.json (check AWS access or key).';
        this.saveRuns();
      }
    });

    this.testResults.getResultLink(htmlKey).subscribe({
      next: resp => {
        run.resultUrl = resp?.url;
        this.releases.update(run.id, { resultUrl: run.resultUrl, stage: 'delivered' });
        this.syncRunToWeeklyBoard(run, {
          resultsLink: run.resultUrl,
          status: this.mapWeeklyStatus(run.status)
        });
        this.testResults.saveResultRun({
          name: jsonKey,
          key: jsonKey,
          data: undefined,
          resultUrl: run.resultUrl
        }).subscribe({ next: () => {}, error: () => {} });

        const derivedKey = this.deriveKeyFromUrl(run.resultUrl);
        if (derivedKey) {
          const derivedJsonKey = derivedKey.replace(/result\.html$/, 'test.json');
          this.testResults.fetchRemoteJson(derivedJsonKey).subscribe({
            next: resp2 => {
              if (resp2?.data) {
                this.testResults.saveResultRun({
                  name: derivedJsonKey,
                  key: derivedJsonKey,
                  data: resp2.data,
                  resultUrl: run.resultUrl
                }).subscribe({ next: () => {}, error: () => {} });
              }
            },
            error: () => {
              /* ignore */
            }
          });
        }
        this.saveRuns();
      },
      error: () => {
        // ignore
      }
    });
  }

  private updateBannerStatus(): void {
    if (!this.recentRuns.length) {
      this.jenkinsStatus = '';
      return;
    }
    const latest = this.recentRuns[0];
    const suffix = latest.buildNumber ? ` (#${latest.buildNumber})` : '';
    const runKind = latest.runType === 'test-cases' ? 'test cases' : 'suite';
    this.jenkinsStatus = `Latest: ${latest.status}${suffix} · ${runKind}`;
  }

  private ensureExpandedRun(): void {
    if (!this.recentRuns.length) {
      this.expandedRunId = null;
      return;
    }
    if (this.expandedRunId && this.recentRuns.some(run => run.id === this.expandedRunId)) {
      return;
    }
    const active = this.recentRuns.find(run => this.isActiveStatus(run?.status));
    this.expandedRunId = (active || this.recentRuns[0])?.id ?? null;
  }

  private isActiveStatus(status: string | undefined): boolean {
    const normalized = String(status || '').toLowerCase();
    return ['queued', 'pending', 'running', 'inprogress', 'in-progress', 'triggered'].includes(normalized);
  }

  private mapWeeklyStatus(status: string | undefined): WeeklyJobStatus {
    const normalized = String(status || '').toLowerCase();
    if (['queued', 'pending', 'triggered'].includes(normalized)) return 'QUEUED';
    if (['running', 'inprogress', 'in-progress'].includes(normalized)) return 'RUNNING';
    if (['completed', 'success'].includes(normalized)) return 'SUCCESS';
    if (['cancelled', 'aborted', 'failure', 'failed'].includes(normalized)) return 'FAILED';
    return 'NOT_RUN';
  }

  private computePassRate(passed: number, failed: number): number {
    const total = Math.max(0, passed + failed);
    return total > 0 ? Number(((passed / total) * 100).toFixed(2)) : 0;
  }

  private syncRunToWeeklyBoard(
    run: ExecuteRun,
    patch: {
      totalAutomated?: number;
      passed?: number;
      failed?: number;
      passRate?: number;
      resultsLink?: string;
      status?: WeeklyJobStatus;
      errorMessage?: string;
    } = {}
  ): void {
    if (run.runType !== 'tag' || !run.feature) return;

    if (!run.weeklyExecutionId) {
      run.weeklyExecutionId = `ondemand-${run.id}`;
    }

    this.weeklyStatus
      .upsertExecution({
        id: run.weeklyExecutionId,
        tag: run.feature,
        environment: run.env,
        browser: run.browser,
        deviceType: run.deviceType,
        executionType: 'ON_DEMAND',
        status: patch.status || this.mapWeeklyStatus(run.status),
        executedAt: run.createdAtIso || new Date().toISOString(),
        queueId: run.queueId,
        queueUrl: run.queueUrl,
        buildUrl: run.buildUrl,
        buildNumber: run.buildNumber,
        runPrefix: run.prefix,
        resultsLink: patch.resultsLink ?? run.resultUrl,
        totalAutomated: patch.totalAutomated,
        passed: patch.passed,
        failed: patch.failed,
        passRate: patch.passRate,
        errorMessage: patch.errorMessage
      })
      .subscribe({
        next: resp => {
          if (resp?.id && resp.id !== run.weeklyExecutionId) {
            run.weeklyExecutionId = resp.id;
            this.saveRuns();
          }
        },
        error: () => {
          // The weekly board should not break the trigger flow.
        }
      });
  }

  private deriveKeyFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
      const targetUrl = new URL(url);
      return decodeURIComponent(targetUrl.pathname.replace(/^\/+/, ''));
    } catch {
      return null;
    }
  }

  private optionalString(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  }

  private optionalNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : undefined;
  }
}
