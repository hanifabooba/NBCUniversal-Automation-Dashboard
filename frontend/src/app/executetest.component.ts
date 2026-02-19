import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JenkinsService, JenkinsTriggerRequest } from './jenkins.service';
import { TestResultsService } from './test-results.service';
import { ReleaseService } from './release.service';

@Component({
  standalone: true,
  selector: 'app-executetest',
  imports: [CommonModule, FormsModule],
  templateUrl: './executetest.component.html'
})
export class ExecuteTestComponent {
  // Jenkins trigger UI state
  jenkinsEnvironments = ['Production', 'Preprod', 'Stage'];
  jenkinsBrowsers = ['chrome', 'firefox', 'MicrosoftEdge'];
  deviceTypes = ['Desktop_Web', 'Mobile_Web'];
  jenkinsFeatures = [
    '@dw_smoke',
    '@mw_testRunner',
    '@dw_testRunner',
    '@dw_regression',
    '@mw_regression',
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
    '@dw_hamburger_menu'
  ];
  selectedEnv = 'Preprod';
  selectedBrowser = 'chrome';
  selectedDeviceTypes: string[] = ['Desktop_Web'];
  selectedFeature = '@dw_smoke';
  qaUser = '';
  comment = '';
  jiraTicket = '';
  jenkinsStatus = '';
  jenkinsBusy = false;
  expandedRunId: number | null = null;
  // Simple run feed (client-side) using latest triggers
  recentRuns: Array<{
    id: number;
    status: string; // queued, running, success, failure, aborted, etc.
    who: string;
    when: string;
    date: string;
    env: string;
    feature: string;
    browser?: string;
    deviceType?: string;
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
  }> = [];
  private pollHandle: any;

  constructor(
    private jenkins: JenkinsService,
    private testResults: TestResultsService,
    private releases: ReleaseService
  ) {}

  triggerJenkins(): void {
    this.jenkinsStatus = '';
    this.jenkinsBusy = true;
    const deviceType = this.currentDeviceType();
    const payload: JenkinsTriggerRequest = {
      environment: this.selectedEnv,
      featureTag: this.selectedFeature,
      browser: this.selectedBrowser,
      deviceType
    };
    this.jenkins.triggerBuild(payload).subscribe({
      next: res => {
        this.jenkinsBusy = false;
        const queueText = res.queueId ? ` (queue #${res.queueId})` : '';
        this.jenkinsStatus = res.message || `Triggered${queueText}`;
        // Push a new run card entry
        const now = new Date();
        const userComment = this.comment.trim();
        const userJira = this.jiraTicket.trim();
        const userName = this.qaUser.trim() || 'Manual QA';
        const newRunId = res.queueId || Date.now();
        this.recentRuns.unshift({
          id: newRunId,
          status: res.queued ? 'queued' : 'triggered',
          who: userName,
          when: now.toLocaleTimeString(),
          date: now.toLocaleDateString(),
          env: this.selectedEnv,
          feature: this.selectedFeature,
          browser: this.selectedBrowser,
          deviceType,
          comment: userComment || '',
          jira: userJira || '',
          queueUrl: res.queueUrl,
          queueId: res.queueId,
          note: queueText || res.message || '',
          testJsonUrl: undefined,
          resultUrl: undefined,
          artifactError: undefined
        });
        // add to release board
        this.releases.add({
          id: res.queueId || Date.now(),
          qa: userName,
          feature: this.selectedFeature,
          environment: this.selectedEnv,
          comment: userComment || '',
          jira: userJira || '',
          stage: 'orders',
          createdAt: now.toISOString()
        });
        this.qaUser = '';
        this.comment = '';
        this.jiraTicket = '';
        // Keep feed reasonably small
        this.recentRuns = this.recentRuns.slice(0, 20);
        this.expandedRunId = newRunId;
        this.saveRuns();
        this.updateBannerStatus();
      },
      error: (err) => {
        this.jenkinsBusy = false;
        const detail = err?.error?.message || err?.message || 'Unknown error';
        this.jenkinsStatus = `Failed to trigger Jenkins: ${detail}`;
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

  private startPolling(): void {
    this.pollHandle = setInterval(() => {
      this.pollActiveRuns();
    }, 5000);
  }

  private pollActiveRuns(): void {
    this.recentRuns.forEach(run => {
      if (run.status === 'queued' && run.id) {
        this.jenkins.getQueueInfo(run.id).subscribe({
          next: info => {
            if (info.cancelled) run.status = 'cancelled';
            if (info.executable?.url) {
              run.buildUrl = info.executable.url;
              run.buildNumber = info.executable.number;
              run.status = 'running';
            }
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
            // capture prefix from build info parameters/env
            const prefix = this.extractPrefix(build);
            if (prefix) run.prefix = prefix;

            if (build.building) {
              run.status = 'running';
            } else if (build.result) {
              const res = build.result.toLowerCase();
              run.status = res === 'success' ? 'completed' : res;
              if (run.prefix && !run.testJsonUrl && !run.fetchingArtifacts) {
                this.fetchArtifacts(run);
              }
            }
            this.saveRuns();
            this.updateBannerStatus();
          },
          error: () => {
            // ignore transient errors
          }
        });
      } else if (run.status === 'completed' && run.buildUrl && !run.prefix) {
        // Try one more time to capture prefix after completion
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

  cancelRun(run: any): void {
    if (run.status === 'completed' || run.status === 'failure' || run.status === 'failed') return;
    // If queued, cancel queue item; if running, stop build
    if (run.status === 'queued' && run.queueId) {
      this.jenkins.cancelQueue(run.queueId).subscribe({
        next: () => {
          run.status = 'cancelled';
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
          this.saveRuns();
          this.updateBannerStatus();
        },
        error: err => {
          run.note = err?.error?.message || 'Stop failed';
        }
      });
    }
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
        this.recentRuns = JSON.parse(raw);
      }
    } catch {
      this.recentRuns = [];
    }
    this.updateBannerStatus();
    this.ensureExpandedRun();
  }

  private extractPrefix(build: any): string | null {
    if (build?.runPrefix) return build.runPrefix;
    if (Array.isArray(build?.parameters)) {
      const found = build.parameters.find((p: any) => p?.name === 'RUN_PREFIX' || p?.name === 'ARTIFACT_PREFIX');
      if (found?.value) return String(found.value);
    }
    return null;
  }

  toggleDeviceType(type: string): void {
    if (!type) return;
    // Only allow one selection; clicking a type selects it exclusively.
    this.selectedDeviceTypes = [type];
  }

  private currentDeviceType(): string {
    const first = this.selectedDeviceTypes.find(Boolean);
    return first || 'Desktop_Web';
  }

  private fetchArtifacts(run: any): void {
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
        // Persist to release board and backend result runs
        this.releases.update(run.id, { testJsonUrl: run.testJsonUrl });
        if (resp?.data) {
          this.testResults.saveResultRun({
            name: jsonKey,
            key: jsonKey,
            data: resp.data,
            resultUrl: run.resultUrl
          }).subscribe({ next: () => {}, error: () => {} });
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
        // Save the run to backend even if test.json wasn’t fetched (data may be empty)
        this.testResults.saveResultRun({
          name: jsonKey,
          key: jsonKey,
          data: undefined,
          resultUrl: run.resultUrl
        }).subscribe({ next: () => {}, error: () => {} });

        // If we have a result URL, derive the key directly from it and pull test.json to ensure consistency
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
    this.jenkinsStatus = `Latest: ${latest.status}${suffix}`;
  }

  toggleRunDetails(run: any): void {
    if (!run) return;
    this.expandedRunId = this.expandedRunId === run.id ? null : run.id;
  }

  isRunExpanded(run: any): boolean {
    return !!run && this.expandedRunId === run.id;
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
    const s = String(status || '').toLowerCase();
    return ['queued', 'pending', 'running', 'inprogress', 'in-progress', 'triggered'].includes(s);
  }

  private deriveKeyFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      // strip leading slash and querystring
      return decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    } catch {
      return null;
    }
  }
}
