import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class ApiRequestInterceptor implements HttpInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const shopId = this.tenantContext.currentShopId;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (shopId) {
      headers['X-Shop-Id'] = shopId;
    }

    const cloned = req.clone({ setHeaders: headers });
    return next.handle(cloned);
  }
}
