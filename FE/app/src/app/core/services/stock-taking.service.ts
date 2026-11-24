import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { StockTakeItem, StockTakeSession } from '../models/inventory.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class StockTakingService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/stock-takes`;

  constructor(private readonly http: HttpClient) {}

  getSessions(): Observable<StockTakeSession[]> {
    return this.http
      .get<ApiResponse<StockTakeSession[]>>(this.baseUrl)
      .pipe(map((res) => res.data));
  }

  getSession(id: string): Observable<StockTakeSession & { items: StockTakeItem[] }> {
    return this.http
      .get<ApiResponse<StockTakeSession & { items: StockTakeItem[] }>>(`${this.baseUrl}/${id}`)
      .pipe(map((res) => res.data));
  }

  createSession(payload: {
    title: string;
    notes?: string;
    scope?: 'ALL' | 'PHONES_ONLY' | 'ACCESSORIES_ONLY';
  }): Observable<{ id: string; sessionCode: string }> {
    return this.http
      .post<ApiResponse<{ id: string; sessionCode: string }>>(this.baseUrl, payload)
      .pipe(map((res) => res.data));
  }

  updateCounts(
    sessionId: string,
    items: Array<{
      id: string;
      countedQuantity: number;
      discrepancyReason?: string;
      verified?: boolean;
    }>
  ): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.baseUrl}/${sessionId}/counts`, { items });
  }

  finalizeSession(sessionId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.baseUrl}/${sessionId}/finalize`, {});
  }

  cancelSession(sessionId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.baseUrl}/${sessionId}/cancel`, {});
  }
}
