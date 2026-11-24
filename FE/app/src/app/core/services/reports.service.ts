import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiService, QueryParamMap } from './api.service';
import {
  SalesReportData,
  PurchasesReportData,
  InventoryReportData,
  ProfitReportData,
  CustomerCreditReportData,
  ReturnsWarrantyReportData,
  ReportFilterParams,
} from '../models/reports.models';

export interface ReportsApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/+$/, '');

  constructor(
    private readonly api: ApiService,
    private readonly http: HttpClient
  ) {}

  getSalesReport(params?: ReportFilterParams): Observable<ReportsApiResponse<SalesReportData>> {
    return this.api.get<ReportsApiResponse<SalesReportData>>('/reports/sales', params as QueryParamMap);
  }

  getPurchasesReport(params?: ReportFilterParams): Observable<ReportsApiResponse<PurchasesReportData>> {
    return this.api.get<ReportsApiResponse<PurchasesReportData>>('/reports/purchases', params as QueryParamMap);
  }

  getInventoryReport(params?: ReportFilterParams): Observable<ReportsApiResponse<InventoryReportData>> {
    return this.api.get<ReportsApiResponse<InventoryReportData>>('/reports/inventory', params as QueryParamMap);
  }

  getProfitReport(params?: ReportFilterParams): Observable<ReportsApiResponse<ProfitReportData>> {
    return this.api.get<ReportsApiResponse<ProfitReportData>>('/reports/profit', params as QueryParamMap);
  }

  getCustomerCreditReport(params?: ReportFilterParams): Observable<ReportsApiResponse<CustomerCreditReportData>> {
    return this.api.get<ReportsApiResponse<CustomerCreditReportData>>('/reports/customers', params as QueryParamMap);
  }

  getReturnsWarrantyReport(params?: ReportFilterParams): Observable<ReportsApiResponse<ReturnsWarrantyReportData>> {
    return this.api.get<ReportsApiResponse<ReturnsWarrantyReportData>>('/reports/returns-warranty', params as QueryParamMap);
  }

  exportCsv(report: string, params?: ReportFilterParams): Observable<Blob> {
    let httpParams = new HttpParams().set('report', report);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      }
    }

    return this.http.get(`${this.baseUrl}/reports/export/csv`, {
      params: httpParams,
      responseType: 'blob',
    });
  }

  exportPdf(report: string, params?: ReportFilterParams): Observable<Blob> {
    let httpParams = new HttpParams().set('report', report);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      }
    }

    return this.http.get(`${this.baseUrl}/reports/export/pdf`, {
      params: httpParams,
      responseType: 'blob',
    });
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
