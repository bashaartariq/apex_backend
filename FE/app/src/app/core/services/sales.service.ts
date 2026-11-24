import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SaleSummary, SaleDetails } from '../models/pos.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/sales`;

  constructor(private readonly http: HttpClient) {}

  getSales(filters?: { search?: string; status?: string; dateFrom?: string; dateTo?: string }): Observable<SaleSummary[]> {
    let params = new HttpParams();
    if (filters?.search) params = params.set('search', filters.search);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params = params.set('dateTo', filters.dateTo);

    return this.http.get<ApiResponse<SaleSummary[]>>(this.baseUrl, { params }).pipe(map((res) => res.data));
  }

  getSaleById(id: string): Observable<SaleDetails> {
    return this.http.get<ApiResponse<SaleDetails>>(`${this.baseUrl}/${id}`).pipe(map((res) => res.data));
  }

  downloadInvoicePdf(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/invoice/pdf`, { responseType: 'blob' });
  }

  reverseSale(id: string, reason: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/${id}/reverse`, { reason }).pipe(map((res) => res.data));
  }
}
