import { Injectable, signal } from '@angular/core';

export type ReleaseStage = 'orders' | 'preparing' | 'assign' | 'inroute' | 'delivered';
export type ReleaseRunType = 'tag' | 'test-cases';

export interface ReleaseEntry {
  id: number;
  qa: string;
  feature: string;
  runType?: ReleaseRunType;
  featureFiles?: string[];
  branch?: string;
  environment: string;
  comment?: string;
  jira?: string;
  resultUrl?: string;
  testJsonUrl?: string;
  stage: ReleaseStage;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private storageKey = 'release-board';
  releasesSignal = signal<ReleaseEntry[]>(this.load());

  add(entry: ReleaseEntry) {
    const current = this.releasesSignal();
    const updated = [entry, ...current];
    this.releasesSignal.set(updated);
    this.save(updated);
  }

  update(id: number, patch: Partial<ReleaseEntry>) {
    const updated = this.releasesSignal().map(r => (r.id === id ? { ...r, ...patch } : r));
    this.releasesSignal.set(updated);
    this.save(updated);
  }

  private load(): ReleaseEntry[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ReleaseEntry[];
        if (Array.isArray(parsed)) {
          return parsed.map(entry => ({
            ...entry,
            featureFiles: Array.isArray(entry?.featureFiles) ? entry.featureFiles.filter(Boolean) : undefined
          }));
        }
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  private save(data: ReleaseEntry[]) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
}
