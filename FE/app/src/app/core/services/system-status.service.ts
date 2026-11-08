import { Injectable } from '@angular/core';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  HealthStatusResponse,
  NormalizedApiError,
  VersionInfoResponse,
} from '../models/api.models';

export interface SystemConnectivityState {
  checking: boolean;
  connected: boolean;
  health: HealthStatusResponse | null;
  version: VersionInfoResponse | null;
  error: NormalizedApiError | null;
  lastCheckedAt: string | null;
}

const INITIAL_STATE: SystemConnectivityState = {
  checking: false,
  connected: false,
  health: null,
  version: null,
  error: null,
  lastCheckedAt: null,
};

@Injectable({
  providedIn: 'root',
})
export class SystemStatusService {
  private readonly stateSubject = new BehaviorSubject<SystemConnectivityState>(INITIAL_STATE);
  readonly state$: Observable<SystemConnectivityState> = this.stateSubject.asObservable();

  constructor(private readonly api: ApiService) {}

  checkConnectivity(): Observable<{
    health: HealthStatusResponse | null;
    version: VersionInfoResponse | null;
  }> {
    this.stateSubject.next({
      ...this.stateSubject.value,
      checking: true,
      error: null,
    });

    let capturedError: NormalizedApiError | null = null;

    return forkJoin({
      health: this.api.get<HealthStatusResponse>('/health'),
      version: this.api.get<VersionInfoResponse>('/version'),
    }).pipe(
      tap(({ health, version }) => {
        this.stateSubject.next({
          checking: false,
          connected: health.status === 'ok' && health.database.connected,
          health,
          version,
          error: null,
          lastCheckedAt: new Date().toISOString(),
        });
      }),
      catchError((err: NormalizedApiError) => {
        capturedError = err;
        this.stateSubject.next({
          checking: false,
          connected: false,
          health: null,
          version: null,
          error: capturedError,
          lastCheckedAt: new Date().toISOString(),
        });
        return of({ health: null, version: null });
      }),
      finalize(() => {
        const current = this.stateSubject.value;
        if (current.checking) {
          this.stateSubject.next({ ...current, checking: false });
        }
      })
    );
  }
}
