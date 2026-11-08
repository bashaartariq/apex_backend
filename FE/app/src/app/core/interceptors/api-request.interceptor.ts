import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class ApiRequestInterceptor implements HttpInterceptor {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly router: Router
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const shopId = this.tenantContext.currentShopId;
    const token = localStorage.getItem('apex_access_token');

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (shopId) {
      headers['X-Shop-Id'] = shopId;
    }

    const cloned = req.clone({
      setHeaders: headers,
      withCredentials: true,
    });

    return next.handle(cloned).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          const currentUrl = this.router.url;
          if (!currentUrl.includes('/login') && !currentUrl.includes('/register')) {
            localStorage.removeItem('apex_access_token');
            localStorage.removeItem('apex_user_session');
            localStorage.removeItem('apex_shop_session');
            this.router.navigate(['/login'], { queryParams: { returnUrl: currentUrl } });
          }
        }
        return throwError(() => error);
      })
    );
  }
}
