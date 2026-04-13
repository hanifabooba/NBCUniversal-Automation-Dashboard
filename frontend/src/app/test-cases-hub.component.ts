import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';

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
  templateUrl: './test-cases-hub.component.html',
  styleUrls: ['./test-cases-hub.component.css']
})
export class TestCasesHubComponent {
  constructor(
    private location: Location,
    private router: Router
  ) {}

  links: TestCaseLink[] = [
    {
      title: 'Deepali Automation Suite',
      description: 'Google Sheets library for Deepali automation test suite.',
      url: 'https://docs.google.com/spreadsheets/d/1W5WLPY4IppnJp87Njco2E57WOP4_5l_cLT8AyXow_7o/edit?gid=0#gid=0',
      tag: 'Google Sheets'
    },
    {
      title: 'Regression Test Case Document',
      description: 'SharePoint workbook containing the regression test case documentation.',
      url: 'https://nbcuni-my.sharepoint.com/:x:/r/personal/206094885_tfayd_com/_layouts/15/Doc.aspx?sourcedoc=%7B8193a44a-0aa1-4202-8d59-f0bff1a250c5%7D&action=view&activeCell=%27Desktop%20Regression%20Suite%27!B5&wdinitialsession=52a53e3d-0b83-705e-4d06-5ab6431ac17d&wdrldsc=3&wdrldc=1&wdrldr=AccessTokenExpiredWarningUnauthenticated%2CRefreshin',
      tag: 'SharePoint'
    }
  ];

  get totalSources(): number {
    return this.links.length;
  }

  get sourceTags(): string[] {
    return Array.from(new Set(this.links.map(link => link.tag).filter((tag): tag is string => !!tag)));
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/');
  }
}
