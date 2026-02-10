import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RoleService, UserContext } from './role.service';

@Component({
  standalone: true,
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  readonly ssoBaseUrl = 'https://login.inbcu.com/ssologin';
  constructor(private roles: RoleService, private router: Router) {}

  get ssoHref(): string {
    const target = this.appReturnUrl();
    try {
      const url = new URL(this.ssoBaseUrl);
      url.searchParams.set('TARGET', target);
      return url.toString();
    } catch {
      const separator = this.ssoBaseUrl.includes('?') ? '&' : '?';
      return `${this.ssoBaseUrl}${separator}TARGET=${encodeURIComponent(target)}`;
    }
  }

  signIn(): void {
    // Redirect to the dedicated login page instead of using the temporary bypass.
    this.router.navigate(['/login']);
  }

  private appReturnUrl(): string {
    if (typeof window === 'undefined') return '/';
    return `${window.location.origin}/`;
  }
}
