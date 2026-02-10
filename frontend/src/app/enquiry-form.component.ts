import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EnquiryService } from './enquiry.service';

@Component({
  standalone: true,
  selector: 'app-enquiry-form',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './enquiry-form.component.html'
})
export class EnquiryFormComponent {
  productSlug: string | null;
  name = '';
  phone = '';
  email = '';
  question = '';
  submitted = false;
  submitting = false;
  error = '';

  constructor(route: ActivatedRoute, private enquiries: EnquiryService) {
    this.productSlug = route.snapshot.paramMap.get('productSlug');
  }

  onSubmit() {
    this.error = '';
    if (!this.name.trim() || !this.phone.trim() || !this.question.trim()) {
      return;
    }
    this.submitting = true;
    this.enquiries
      .submit({
        productSlug: this.productSlug || undefined,
        name: this.name.trim(),
        phone: this.phone.trim(),
        email: this.email.trim() || undefined,
        question: this.question.trim()
      })
      .subscribe({
        next: res => {
          this.submitting = false;
          if (res) {
            this.submitted = true;
          } else {
            this.error = 'Unable to submit right now. Please try again.';
          }
        },
        error: () => {
          this.submitting = false;
          this.error = 'Unable to submit right now. Please try again.';
        }
      });
  }
}
