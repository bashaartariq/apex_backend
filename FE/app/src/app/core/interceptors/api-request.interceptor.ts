import { Injectable, Injector } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { TenantContextService } from '../services/tenant-context.service';
import { AuthService } from '../services/auth.service';

@Injectable()
export class ApiRequestInterceptor implements HttpInterceptor {
  private authService?: AuthService;
  private isRefreshing = false;
  private readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(
    private readonly injector: Injector,
    private readonly tenantContext: TenantContextService,
    private readonly router: Router
  ) {}

  private getAuth(): AuthService {
    if (!this.authService) {
      this.authService = this.injector.get(AuthService);
    }
    return this.authService;
  }

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const isPublicAuthUrl =
      req.url.includes('/auth/login') || req.url.includes('/auth/register');
    const isRefreshUrl = req.url.includes('/auth/refresh');

    const shopId = this.tenantContext.currentShopId;
    const token = localStorage.getItem('apex_access_token');

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (token && !isPublicAuthUrl) {
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
        // Network connection dropped or API server offline: do NOT log out
        if (error.status === 0) {
          return throwError(() => error);
        }

        // 403 Forbidden: User is authenticated but lacks permission for action: do NOT log out
        if (error.status === 403) {
          return throwError(() => error);
        }

        // 401 Unauthorized handling
        if (error.status === 401) {
          // If login or register failed with 401 (e.g. wrong credentials), pass through error to component
          if (isPublicAuthUrl) {
            return throwError(() => error);
          }

          // If refresh token request itself failed with 401, refresh token is expired or revoked
          if (isRefreshUrl) {
            this.isRefreshing = false;
            this.refreshTokenSubject.next(null);
            this.getAuth().handleSessionExpired();
            return throwError(() => error);
          }

          // Protected API returned 401 -> handle session expiration or refresh
          return this.handle401Error(cloned, next, error);
        }

        return throwError(() => error);
      })
    );
  }

  private handle401Error(
    req: HttpRequest<unknown>,
    next: HttpHandler,
    originalError: HttpErrorResponse
  ): Observable<HttpEvent<unknown>> {
    const auth = this.getAuth();

    // If user is already on unauthenticated login/register screen, avoid redundant logouts
    const currentUrl = this.router.url;
    if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
      return throwError(() => originalError);
    }

    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return auth.refreshToken().pipe(
        switchMap((newToken) => {
          this.isRefreshing = false;

          if (newToken) {
            this.refreshTokenSubject.next(newToken);
            return next.handle(
              req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`,
                },
                withCredentials: true,
              })
            );
          }

          // Refresh token failed or expired: perform centralized automatic logout
          auth.handleSessionExpired();
          return throwError(() => originalError);
        }),
        catchError((refreshErr) => {
          this.isRefreshing = false;
          auth.handleSessionExpired();
          return throwError(() => refreshErr);
        })
      );
    } else {
      // If multiple requests return 401 simultaneously, wait for ongoing refresh to complete
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap((token) => {
          return next.handle(
            req.clone({
              setHeaders: {
                Authorization: `Bearer ${token}`,
              },
              withCredentials: true,
            })
          );
        })
      );
    }
  }
}
