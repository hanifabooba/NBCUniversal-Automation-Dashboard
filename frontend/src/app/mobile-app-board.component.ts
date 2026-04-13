import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

type MobilePlatform = 'ANDROID' | 'IOS';

interface MobilePlatformOption {
  value: MobilePlatform;
  label: string;
  icon: string;
  accept: string;
  artifactLabel: string;
  helper: string;
}

interface ReadinessItem {
  label: string;
  complete: boolean;
  hint: string;
}

@Component({
  standalone: true,
  selector: 'app-mobile-app-board',
  imports: [CommonModule, FormsModule],
  templateUrl: './mobile-app-board.component.html',
  styleUrls: ['./mobile-app-board.component.css']
})
export class MobileAppBoardComponent {
  readonly environments = ['Production', 'Preprod', 'Stage', 'QA', 'UAT'];
  readonly executionProfiles = ['Smoke', 'Sanity', 'Regression', 'Targeted Feature', 'Upload Validation'];
  readonly platformOptions: MobilePlatformOption[] = [
    {
      value: 'ANDROID',
      label: 'Android',
      icon: 'bi-android2',
      accept: '.apk,.aab',
      artifactLabel: 'APK / AAB',
      helper: 'Upload an Android application build in APK or AAB format.'
    },
    {
      value: 'IOS',
      label: 'iOS',
      icon: 'bi-apple',
      accept: '.ipa',
      artifactLabel: 'IPA',
      helper: 'Upload an iOS application package in IPA format.'
    }
  ];

  selectedEnvironment = 'Stage';
  selectedExecutionProfile = 'Smoke';
  selectedPlatforms: MobilePlatform[] = ['ANDROID'];
  qaName = '';
  buildLabel = '';
  featureScope = '';
  notes = '';
  appUploads: Record<MobilePlatform, File | null> = {
    ANDROID: null,
    IOS: null
  };
  draftPreparedAt: string | null = null;

  constructor(
    private location: Location,
    private router: Router
  ) {}

  get activePlatforms(): MobilePlatformOption[] {
    return this.platformOptions.filter(option => this.selectedPlatforms.includes(option.value));
  }

  get uploadedCount(): number {
    return this.activePlatforms.filter(option => !!this.appUploads[option.value]).length;
  }

  get readinessItems(): ReadinessItem[] {
    return [
      {
        label: 'Execution environment selected',
        complete: !!this.selectedEnvironment,
        hint: 'Choose the release tier this native package will target.'
      },
      {
        label: 'At least one mobile platform selected',
        complete: this.selectedPlatforms.length > 0,
        hint: 'Select Android, iOS, or both depending on what should run.'
      },
      {
        label: 'Artifacts attached for each selected platform',
        complete: this.activePlatforms.every(option => !!this.appUploads[option.value]),
        hint: 'Each selected platform should have its own native package ready.'
      },
      {
        label: 'Execution profile and feature scope defined',
        complete: !!this.selectedExecutionProfile && !!this.featureScope.trim(),
        hint: 'Document the suite or feature area that should be exercised.'
      },
      {
        label: 'QA owner assigned',
        complete: !!this.qaName.trim(),
        hint: 'Capture who is responsible for this mobile run.'
      }
    ];
  }

  get readinessScore(): number {
    const completed = this.readinessItems.filter(item => item.complete).length;
    return Math.round((completed / this.readinessItems.length) * 100);
  }

  get readinessLabel(): string {
    if (this.readinessScore >= 100) return 'Ready for pipeline hookup';
    if (this.readinessScore >= 80) return 'Almost ready';
    if (this.readinessScore >= 60) return 'Needs a few details';
    if (this.readinessScore >= 40) return 'Still shaping';
    return 'Not ready yet';
  }

  get readinessDialStyle(): string {
    const score = Math.max(0, Math.min(100, this.readinessScore));
    return `conic-gradient(var(--mobile-board-green) 0% ${score}%, rgba(49, 82, 119, 0.14) ${score}% 100%)`;
  }

  get launchPlatformsLabel(): string {
    if (!this.selectedPlatforms.length) {
      return 'No platform selected yet';
    }
    return this.activePlatforms.map(option => option.label).join(' + ');
  }

  get launchArtifactsLabel(): string {
    const uploaded = this.activePlatforms
      .map(option => this.appUploads[option.value]?.name)
      .filter((name): name is string => !!name);

    if (!uploaded.length) {
      return 'No native build uploaded yet';
    }
    return uploaded.join(' • ');
  }

  get draftStatusLabel(): string {
    return this.draftPreparedAt ? `Draft prepared ${this.draftPreparedAt}` : 'Draft-only mode · Jenkins integration pending';
  }

  isPlatformSelected(platform: MobilePlatform): boolean {
    return this.selectedPlatforms.includes(platform);
  }

  togglePlatform(platform: MobilePlatform, checked: boolean): void {
    if (checked) {
      if (!this.selectedPlatforms.includes(platform)) {
        this.selectedPlatforms = [...this.selectedPlatforms, platform];
      }
      return;
    }

    this.selectedPlatforms = this.selectedPlatforms.filter(value => value !== platform);
    this.appUploads[platform] = null;
  }

  onAppFileSelected(platform: MobilePlatform, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.appUploads[platform] = file;
  }

  clearAppFile(platform: MobilePlatform, input: HTMLInputElement): void {
    this.appUploads[platform] = null;
    input.value = '';
  }

  formatFileSize(size = 0): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  prepareDraft(): void {
    const stamp = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date());
    this.draftPreparedAt = stamp;
  }

  clearDraft(): void {
    this.draftPreparedAt = null;
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/dashboard');
  }
}
