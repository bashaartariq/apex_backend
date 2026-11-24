import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ReturnRecord } from '../models/pos.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class ReturnsService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/returns`;

  constructor(private readonly http: HttpClient) {}

  getReturns(): Observable<ReturnRecord[]> {
    return this.http.get<ApiResponse<ReturnRecord[]>>(this.baseUrl).pipe(map((res) => res.data));
  }

  processReturn(payload: {
    saleId: string;
    returnType: 'REFUND' | 'EXCHANGE';
    reason: string;
    items: Array<{
      saleItemId: string;
      quantity: number;
      unitRefundAmount: number;
      restoreToInventory: boolean;
    }>;
  }): Observable<any> {
    return this.http.post<ApiResponse<any>>(this.baseUrl, payload).pipe(map((res) => res.data));
  }

  processExchange(payload: {
    returnPayload: {
      saleId: string;
      returnType: 'EXCHANGE';
      reason: string;
      items: Array<{
        saleItemId: string;
        quantity: number;
        unitRefundAmount: number;
        restoreToInventory: boolean;
      }>;
    };
    replacementItems: Array<{
      itemType: 'PHONE' | 'ACCESSORY';
      productId: string;
      quantity: number;
      actualPrice: number;
    }>;
    paymentMethod?: string;
  }): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/exchange`, payload).pipe(map((res) => res.data));
  }
}
