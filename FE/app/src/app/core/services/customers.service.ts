import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Customer, CustomerStatement } from '../models/pos.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class CustomersService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/customers`;

  constructor(private readonly http: HttpClient) {}

  getCustomers(search?: string, status?: string): Observable<Customer[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);

    return this.http.get<ApiResponse<Customer[]>>(this.baseUrl, { params }).pipe(map((res) => res.data));
  }

  getCustomerById(id: string): Observable<Customer> {
    return this.http.get<ApiResponse<Customer>>(`${this.baseUrl}/${id}`).pipe(map((res) => res.data));
  }

  createCustomer(payload: Partial<Customer> & { cnic?: string }): Observable<Customer> {
    return this.http.post<ApiResponse<Customer>>(this.baseUrl, payload).pipe(map((res) => res.data));
  }

  updateCustomer(id: string, payload: Partial<Customer> & { cnic?: string }): Observable<Customer> {
    return this.http.put<ApiResponse<Customer>>(`${this.baseUrl}/${id}`, payload).pipe(map((res) => res.data));
  }

  getCustomerStatement(id: string): Observable<CustomerStatement> {
    return this.http.get<ApiResponse<CustomerStatement>>(`${this.baseUrl}/${id}/statement`).pipe(map((res) => res.data));
  }

  lookupByCnic(cnic: string): Observable<Customer> {
    return this.http.get<ApiResponse<Customer>>(`${this.baseUrl}/lookup/cnic/${encodeURIComponent(cnic)}`).pipe(map((res) => res.data));
  }

  revealCnic(id: string): Observable<{ id: string; cnic: string | null; cnicMasked: string | null; hasCnic: boolean }> {
    return this.http.get<ApiResponse<{ id: string; cnic: string | null; cnicMasked: string | null; hasCnic: boolean }>>(`${this.baseUrl}/${id}/reveal-cnic`).pipe(map((res) => res.data));
  }
}
