import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  PosProductItem,
  CheckoutPayload,
  SaleSummary,
  DiscountRequest,
  CreditOverride,
} from '../models/pos.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class PosService {
  private readonly baseUrl = environment.apiUrl || '/api';

  constructor(private readonly http: HttpClient) {}

  searchProducts(query?: string, type?: 'ALL' | 'PHONE' | 'ACCESSORY'): Observable<PosProductItem[]> {
    let params = new HttpParams();
    if (query) params = params.set('query', query);
    if (type) params = params.set('type', type);

    return this.http
      .get<ApiResponse<PosProductItem[]>>(`${this.baseUrl}/sales/pos/search`, { params })
      .pipe(map((res) => res.data));
  }

  scanLookup(identifier: string): Observable<PosProductItem> {
    return this.http
      .get<ApiResponse<PosProductItem>>(`${this.baseUrl}/products/lookup/${encodeURIComponent(identifier)}`)
      .pipe(map((res) => res.data));
  }

  checkout(payload: CheckoutPayload): Observable<SaleSummary> {
    return this.http
      .post<ApiResponse<SaleSummary>>(`${this.baseUrl}/sales/checkout`, payload)
      .pipe(map((res) => res.data));
  }

  // Discounts workflow
  requestDiscount(payload: {
    itemType: 'PHONE' | 'ACCESSORY';
    productId: string;
    productName: string;
    defaultPrice: number;
    requestedPrice: number;
    reason: string;
  }): Observable<DiscountRequest> {
    return this.http
      .post<ApiResponse<DiscountRequest>>(`${this.baseUrl}/discounts/request`, payload)
      .pipe(map((res) => res.data));
  }

  getDiscounts(status?: string): Observable<DiscountRequest[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http
      .get<ApiResponse<DiscountRequest[]>>(`${this.baseUrl}/discounts`, { params })
      .pipe(map((res) => res.data));
  }

  getPendingDiscounts(): Observable<DiscountRequest[]> {
    return this.getDiscounts('PENDING');
  }

  reviewDiscount(id: string, action: 'APPROVE' | 'REJECT', approvedAmount?: number, rejectionReason?: string): Observable<any> {
    return this.http
      .post<ApiResponse<any>>(`${this.baseUrl}/discounts/${id}/review`, { action, approvedAmount, rejectionReason })
      .pipe(map((res) => res.data));
  }

  // Credit limits override workflow
  requestCreditOverride(payload: {
    customerId: string;
    saleAmount: number;
    reason: string;
  }): Observable<CreditOverride> {
    return this.http
      .post<ApiResponse<CreditOverride>>(`${this.baseUrl}/credit-overrides/request`, payload)
      .pipe(map((res) => res.data));
  }

  getCreditOverrides(status?: string): Observable<CreditOverride[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http
      .get<ApiResponse<CreditOverride[]>>(`${this.baseUrl}/credit-overrides`, { params })
      .pipe(map((res) => res.data));
  }

  getPendingCreditOverrides(): Observable<CreditOverride[]> {
    return this.getCreditOverrides('PENDING');
  }

  reviewCreditOverride(id: string, action: 'APPROVE' | 'REJECT', rejectionReason?: string): Observable<any> {
    return this.http
      .post<ApiResponse<any>>(`${this.baseUrl}/credit-overrides/${id}/review`, { action, rejectionReason })
      .pipe(map((res) => res.data));
  }
}
