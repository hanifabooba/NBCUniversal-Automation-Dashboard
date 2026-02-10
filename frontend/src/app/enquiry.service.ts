import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface Enquiry {
  id: number;
  productSlug?: string;
  name: string;
  phone: string;
  email?: string;
  question: string;
  responded: boolean;
  responderName?: string;
  respondedAt?: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class EnquiryService {
  private apiUrl = '/api/enquiries';

  constructor(private http: HttpClient) {}

  submit(payload: Omit<Enquiry, 'id' | 'responded' | 'responderName' | 'respondedAt' | 'createdAt'>): Observable<Enquiry> {
    return this.http.post<Enquiry>(this.apiUrl, payload).pipe(catchError(() => of(null as unknown as Enquiry)));
  }

  list(): Observable<Enquiry[]> {
    return this.http.get<Enquiry[]>(this.apiUrl).pipe(catchError(() => of([])));
  }

  respond(id: number, message: string, responderName: string): Observable<Enquiry> {
    return this.http
      .patch<Enquiry>(`${this.apiUrl}/${id}/respond`, { message, responderName })
      .pipe(catchError(() => of(null as unknown as Enquiry)));
  }
}
