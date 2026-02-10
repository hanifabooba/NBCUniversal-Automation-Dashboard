import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIf, NgClass } from '@angular/common';
import { RoleService } from './role.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf, NgClass],
  templateUrl: './app.component.html'
})
export class AppComponent {
  title = 'NBCuniversal Automation Dashboard';
  menuOpen = false;

  constructor(public roles: RoleService, private router: Router) {}

  logout() {
    this.roles.clearUser();
    this.router.navigate(['/']);
    this.menuOpen = false;
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  get isHomeRoute(): boolean {
    const url = this.router.url || '/';
    return url === '/' || url.startsWith('/?');
  }
}
