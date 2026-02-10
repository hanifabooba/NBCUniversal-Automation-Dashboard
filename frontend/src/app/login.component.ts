import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleService } from './role.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="py-5">
      <div class="container">
        <div class="row justify-content-center">
          <div class="col-md-7 text-center">
            <div class="card shadow-sm">
              <div class="card-body py-5">
                <h1 class="mb-3">Redirecting to NBCUniversal Login…</h1>
                <p class="text-muted mb-0">
                  If you are not redirected automatically, please
                  <a [href]="ssoBaseUrl">click here</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  error = '';
  readonly ssoBaseUrl = 'https://login.inbcu.com/ssologin';

  constructor(private router: Router, private auth: AuthService, private roles: RoleService) {}

  ngOnInit(): void {
    // For local/dev usage, allow a mock login to avoid depending on SSO.
    if (this.handleMockLogin()) {
      return;
    }
    // Immediately redirect to the external SSO login. On success, SSO should return to the target URL.
    this.redirectToSso();
  }

  /**
   * In local development, skip SSO and create a mock authenticated user.
   * This lets you test the app end-to-end before the demo environment is ready.
   */
  private handleMockLogin(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const host = window.location.hostname;
    const params = new URLSearchParams(window.location.search);
    const shouldMock = host === 'localhost' || params.has('mockLogin');
    if (!shouldMock) {
      return false;
    }
    this.roles.setUser({
      email: 'devuser@nbcuniversal.com',
      name: 'Local Dev User',
      role: 'admin',
      token: 'mock-token'
    });
    this.router.navigate(['/dashboard']);
    return true;
  }

  private redirectToSso(): void {
    window.location.href = this.ssoBaseUrl;
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.error = 'Please enter email and password.';
      return;
    }
    this.auth.login(this.email, this.password).subscribe({
      next: user => {
        this.error = '';
        this.router.navigate(['/dashboard']);
      },
      error: err => {
        this.error = err?.error?.message || 'Login failed.';
      }
    });
  }
}
