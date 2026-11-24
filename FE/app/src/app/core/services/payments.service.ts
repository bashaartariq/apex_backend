import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PaymentReceipt } from '../models/pos.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/payments`;

  constructor(private readonly http: HttpClient) {}

  recordPayment(
    saleId: string,
    payload: {
      paymentMethod: string;
      amount: number;
      transactionReference?: string;
      notes?: string;
    }
  ): Observable<PaymentReceipt> {
    return this.http
      .post<ApiResponse<PaymentReceipt>>(`${this.baseUrl}/sales/${saleId}/payments`, payload)
      .pipe(map((res) => res.data));
  }

  getReceipts(search?: string): Observable<PaymentReceipt[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);

    return this.http
      .get<ApiResponse<PaymentReceipt[]>>(`${this.baseUrl}/receipts`, { params })
      .pipe(map((res) => res.data));
  }

  getReceiptById(id: string): Observable<PaymentReceipt> {
    return this.http
      .get<ApiResponse<PaymentReceipt>>(`${this.baseUrl}/receipts/${id}`)
      .pipe(map((res) => res.data));
  }

  downloadReceiptPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/receipts/${id}/pdf`, { responseType: 'blob' });
  }
}
