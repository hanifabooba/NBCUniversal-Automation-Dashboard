import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface JenkinsTriggerRequest {
  environment: string;
  featureTag: string;
  browser?: string;
  deviceType?: string;
  cause?: string;
}

export interface JenkinsOnDemandTestCaseRequest {
  appFolder: string;
  suiteFolder: string;
  fileName: string;
}

export interface JenkinsOnDemandTestCaseResponse extends JenkinsOnDemandTestCaseRequest {
  relativePath?: string;
}

export interface JenkinsFeatureFilesTriggerRequest {
  environment: string;
  browser: string;
  branch: string;
  testCases: JenkinsOnDemandTestCaseRequest[];
  deviceType?: string;
  cause?: string;
}

export interface JenkinsTriggerResponse {
  queued?: boolean;
  queueId?: number;
  queueUrl?: string;
  message?: string;
  branch?: string;
  featureFiles?: string[];
  testCases?: JenkinsOnDemandTestCaseResponse[];
}

export interface JenkinsQueueInfo {
  executable?: { number?: number; url?: string };
  cancelled?: boolean;
  blocked?: boolean;
  stuck?: boolean;
  why?: string;
}

export interface JenkinsBuildInfo {
  building?: boolean;
  result?: string; // SUCCESS, FAILURE, ABORTED, etc.
  url?: string;
  fullDisplayName?: string;
  parameters?: Array<{ name: string; value: any }>;
  runPrefix?: string | null;
}

/**
 * Minimal Jenkins trigger facade.
 * NOTE: This expects a backend proxy to handle Jenkins auth and CSRF/crumbs.
 */
@Injectable({ providedIn: 'root' })
export class JenkinsService {
  // Backend proxy endpoint you own; it should accept { jobUrl, params } and handle auth/crumb.
  private readonly triggerUrl = '/api/jenkins/trigger';
  private readonly triggerFeatureFilesUrl = '/api/jenkins/trigger-feature-files';
  // Jenkins job with parameters endpoint (pipeline with parameters).
  private readonly jobUrl = 'https://jenkins.otsops.com/job/POC_QA_DASHBOARD/buildWithParameters';

  constructor(private http: HttpClient) {}

  triggerBuild(body: JenkinsTriggerRequest): Observable<JenkinsTriggerResponse> {
    // Shape parameters to match the Jenkins job:
    // FEATURE, ENVIRONMENT, BROWSER are choice parameters on the job; add token in backend if required.
    const payload = {
      jobUrl: this.jobUrl,
      params: {
        FEATURE: body.featureTag,
        ENVIRONMENT: body.environment,
        BROWSER: body.browser,
        DEVICE_TYPE: body.deviceType
      },
      cause: body.cause
    };

    return this.http.post<JenkinsTriggerResponse>(this.triggerUrl, payload);
  }

  triggerFeatureFilesBuild(body: JenkinsFeatureFilesTriggerRequest): Observable<JenkinsTriggerResponse> {
    return this.http.post<JenkinsTriggerResponse>(this.triggerFeatureFilesUrl, body);
  }

  getQueueInfo(queueId: number): Observable<JenkinsQueueInfo> {
    return this.http.get<JenkinsQueueInfo>(`/api/jenkins/queue/${queueId}`);
  }

  cancelQueue(queueId: number): Observable<{ cancelled: boolean }> {
    return this.http.post<{ cancelled: boolean }>(`/api/jenkins/queue/${queueId}/cancel`, {});
  }

  stopBuild(buildUrl: string): Observable<{ stopped: boolean }> {
    return this.http.post<{ stopped: boolean }>(`/api/jenkins/build/stop`, { url: buildUrl });
  }

  getBuildInfo(buildUrl: string): Observable<JenkinsBuildInfo> {
    return this.http.get<JenkinsBuildInfo>(`/api/jenkins/build`, { params: { url: buildUrl } });
  }
}
