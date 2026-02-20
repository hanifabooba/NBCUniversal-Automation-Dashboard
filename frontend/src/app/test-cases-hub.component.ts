import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TestCaseLink {
  title: string;
  description: string;
  url: string;
  tag?: string;
}

@Component({
  standalone: true,
  selector: 'app-test-cases-hub',
  imports: [CommonModule],
  templateUrl: './test-cases-hub.component.html'
})
export class TestCasesHubComponent {
  links: TestCaseLink[] = [];
}
