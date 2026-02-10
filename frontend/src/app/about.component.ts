import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-about',
  imports: [CommonModule, RouterLink],
  templateUrl: './about.component.html'
})
export class AboutComponent {
  highlights = [
    { title: 'Organic-first', description: 'We grow without synthetic pesticides, nourishing soil health and flavor.' },
    { title: 'Local roots', description: 'Built in Greater Accra, serving homes, chefs, and neighborhood markets.' },
    { title: 'People-powered', description: 'Managers, field crew, and seasonal staff working as one team.' }
  ];

  stats = [
    { value: '120+', label: 'Weekly harvest crates' },
    { value: '18', label: 'Greenhouse zones' },
    { value: '24h', label: 'Enquiry response' }
  ];
}
