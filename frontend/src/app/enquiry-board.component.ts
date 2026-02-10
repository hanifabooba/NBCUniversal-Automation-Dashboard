import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EnquiryService, Enquiry } from './enquiry.service';
import { RoleService } from './role.service';

@Component({
  standalone: true,
  selector: 'app-enquiry-board',
  imports: [CommonModule, FormsModule],
  templateUrl: './enquiry-board.component.html'
})
export class EnquiryBoardComponent implements OnInit {
  enquiries: Enquiry[] = [];
  selected?: Enquiry;
  responseMessage = '';
  status = '';

  constructor(private enquiriesApi: EnquiryService, public roles: RoleService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.enquiriesApi.list().subscribe(list => (this.enquiries = list || []));
  }

  toggle(enquiry: Enquiry): void {
    if (this.selected?.id === enquiry.id) {
      this.selected = undefined;
      this.responseMessage = '';
      this.status = '';
    } else {
      this.selected = enquiry;
      this.responseMessage = '';
      this.status = '';
    }
  }

  canRespond(): boolean {
    return (
      this.roles.currentRole() === 'super-admin' ||
      this.roles.currentRole() === 'manager' ||
      this.roles.currentRole() === 'customer-service'
    );
  }

  goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
    }
  }

  sendResponse(): void {
    if (!this.selected || !this.responseMessage.trim()) return;
    const responder = this.roles.currentUser()?.name || 'Team member';
    this.enquiriesApi.respond(this.selected.id, this.responseMessage.trim(), responder).subscribe(updated => {
      if (updated) {
        this.enquiries = this.enquiries.map(e => (e.id === updated.id ? updated : e));
        this.selected = updated;
        this.status = 'Response sent.';
        this.responseMessage = '';
      } else {
        this.status = 'Failed to send response.';
      }
    });
  }
}
