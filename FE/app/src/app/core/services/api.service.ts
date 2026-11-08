import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiErrorPayload, NormalizedApiError } from '../models/api.models';

export type QueryParamPrimitive = string | number | boolean;
export type QueryParamMap = Record<string, QueryParamPrimitive | null | undefined>;

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/+$/, '');

  constructor(private readonly http: HttpClient) {}

  get<T>(endpoint: string, params?: QueryParamMap, headers?: HttpHeaders): Observable<T> {
    return this.http
      .get<T>(this.resolveUrl(endpoint), {
        params: this.buildParams(params),
        headers,
      })
      .pipe(catchError((err: HttpErrorResponse) => this.handleError(err)));
  }

  post<T>(endpoint: string, body: unknown, headers?: HttpHeaders): Observable<T> {
    return this.http
      .post<T>(this.resolveUrl(endpoint), body, { headers })
      .pipe(catchError((err: HttpErrorResponse) => this.handleError(err)));
  }

  put<T>(endpoint: string, body: unknown, headers?: HttpHeaders): Observable<T> {
    return this.http
      .put<T>(this.resolveUrl(endpoint), body, { headers })
      .pipe(catchError((err: HttpErrorResponse) => this.handleError(err)));
  }

  patch<T>(endpoint: string, body: unknown, headers?: HttpHeaders): Observable<T> {
    return this.http
      .patch<T>(this.resolveUrl(endpoint), body, { headers })
      .pipe(catchError((err: HttpErrorResponse) => this.handleError(err)));
  }

  delete<T>(endpoint: string, params?: QueryParamMap, headers?: HttpHeaders): Observable<T> {
    return this.http
      .delete<T>(this.resolveUrl(endpoint), {
        params: this.buildParams(params),
        headers,
      })
      .pipe(catchError((err: HttpErrorResponse) => this.handleError(err)));
  }

  private resolveUrl(endpoint: string): string {
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  private buildParams(params?: QueryParamMap): HttpParams {
    let httpParams = new HttpParams();
    if (!params) {
      return httpParams;
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const backendPayload = error.error as Partial<ApiErrorPayload> | null;
    const normalized: NormalizedApiError = {
      status: error.status,
      code:
        backendPayload?.error?.code ||
        (error.status === 0 ? 'NETWORK_UNREACHABLE' : 'API_REQUEST_FAILED'),
      message:
        backendPayload?.error?.message ||
        (error.status === 0
          ? 'Unable to reach the backend API server. Confirm the Express server is running.'
          : error.message || 'An unexpected API error occurred.'),
      details: backendPayload?.error?.details,
    };

    return throwError(() => normalized);
  }
}
