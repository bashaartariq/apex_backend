import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SystemStatusService } from './core/services/system-status.service';
import { TenantContextService } from './core/services/tenant-context.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  sidebarOpen = false;
  apiConnected = false;
  apiChecking = false;
  activeShopId: string | null = null;

  constructor(
    private readonly statusService: SystemStatusService,
    private readonly tenantService: TenantContextService
  ) {}

  ngOnInit(): void {
    this.statusService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.apiConnected = state.connected;
        this.apiChecking = state.checking;
      });

    this.tenantService.activeShopId$
      .pipe(takeUntil(this.destroy$))
      .subscribe((shopId) => {
        this.activeShopId = shopId;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }
}
