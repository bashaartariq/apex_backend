import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { of, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { BadgeTone } from '../status-badge/status-badge.component';
import { AuthService } from '../../../core/services/auth.service';
import { SearchService } from '../../../core/services/search.service';
import { ThemeService } from '../../../core/services/theme.service';
import {
  LiveAlertItem,
  LiveAlertsSnapshot,
  NotificationsService,
} from '../../../core/services/notifications.service';
import { PosService } from '../../../core/services/pos.service';
import { ToastService } from '../../../core/services/toast.service';
import { GlobalSearchItem, GlobalSearchResults } from '../../../core/models/search.models';

interface QuickCommand {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  shortcut?: string;
  permission?: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() appTitle = 'ApexCellular OS';
  @Input() sidebarOpen = false;
  @Input() sidebarCollapsed = false;
  @Input() apiConnected = false;
  @Input() apiChecking = false;
  @Input() activeShopId: string | null = null;

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() recheckConnectivity = new EventEmitter<void>();

  @ViewChild('searchContainer') searchContainer?: ElementRef<HTMLElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('notificationsContainer') notificationsContainer?: ElementRef<HTMLElement>;
  @ViewChild('profileContainer') profileContainer?: ElementRef<HTMLElement>;

  searchControl = new FormControl('');
  searchResults: GlobalSearchResults | null = null;
  isSearching = false;
  showSearchDropdown = false;
  hasSearched = false;
  activeItemIndex = -1;

  showNotifications = false;
  showProfileMenu = false;
  reviewingId: string | null = null;

  alertsState: LiveAlertsSnapshot = {
    pendingDiscounts: [],
    pendingCreditOverrides: [],
    lowStockAccessories: [],
    alerts: [],
    totalCount: 0,
    loading: false,
    lastUpdated: null,
  };

  private readonly sub = new Subscription();

  private readonly allQuickCommands: readonly QuickCommand[] = [
    {
      id: 'cmd-pos',
      title: 'Open POS Express Register',
      subtitle: 'Start barcode/IMEI scan checkout & split tender',
      icon: 'bi-upc-scan',
      route: '/pos',
      shortcut: 'POS',
      permission: 'pos.access',
    },
    {
      id: 'cmd-phones',
      title: 'Mobile Phones & IMEI Ledger',
      subtitle: 'Inspect serialized devices, battery health & labels',
      icon: 'bi-phone',
      route: '/inventory/phones',
      permission: 'phones.view',
    },
    {
      id: 'cmd-purchases',
      title: 'Purchase Orders & Stock Intake',
      subtitle: 'Create or confirm inward supplier shipments',
      icon: 'bi-box-arrow-in-down',
      route: '/inventory/purchases',
      permission: 'purchases.view',
    },
    {
      id: 'cmd-customers',
      title: 'Customer Directory & Debt Ledger',
      subtitle: 'Look up masked CNIC profiles & collect balances',
      icon: 'bi-people',
      route: '/customers',
      permission: 'customers.view',
    },
    {
      id: 'cmd-returns',
      title: 'Process Returns & Exchanges',
      subtitle: 'Refund or exchange items with FIFO restocking',
      icon: 'bi-arrow-left-right',
      route: '/returns',
      permission: 'returns.manage',
    },
    {
      id: 'cmd-reports',
      title: 'Financial Reports & Exports',
      subtitle: 'Gross margins, valuation, CSV & A4 PDF reports',
      icon: 'bi-bar-chart-line',
      route: '/reports',
      permission: 'reports.view',
    },
  ];

  constructor(
    public readonly auth: AuthService,
    public readonly theme: ThemeService,
    private readonly searchService: SearchService,
    private readonly notificationsService: NotificationsService,
    private readonly posService: PosService,
    private readonly toast: ToastService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.notificationsService.state$.subscribe((snapshot) => {
        this.alertsState = snapshot;
      })
    );

    this.sub.add(
      this.searchControl.valueChanges
        .pipe(
          debounceTime(220),
          distinctUntilChanged(),
          tap((term) => {
            const query = (term || '').trim();
            if (!query) {
              this.searchResults = null;
              this.isSearching = false;
              this.hasSearched = false;
              this.activeItemIndex = -1;
            } else {
              this.isSearching = true;
              this.showSearchDropdown = true;
              this.activeItemIndex = -1;
            }
          }),
          switchMap((term) => {
            const query = (term || '').trim();
            if (!query) {
              return of(null);
            }
            return this.searchService.search(query).pipe(catchError(() => of(null)));
          })
        )
        .subscribe({
          next: (results) => {
            if (this.searchQuery && results) {
              this.searchResults = results as GlobalSearchResults;
              this.hasSearched = true;
              this.showSearchDropdown = true;
            }
            this.isSearching = false;
          },
          error: () => {
            this.isSearching = false;
            this.searchResults = null;
          },
        })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get searchQuery(): string {
    return (this.searchControl.value || '').trim();
  }

  get quickCommands(): QuickCommand[] {
    return this.allQuickCommands.filter((cmd) => {
      if (!cmd.permission || this.auth.isAdmin()) return true;
      return this.auth.hasPermission(cmd.permission);
    });
  }

  get currentShopName(): string {
    return this.auth.currentShop?.name || 'Mobile Phone Shop';
  }

  get userInitials(): string {
    const name = this.auth.currentUser?.name || 'User';
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  get connectionLabel(): string {
    if (this.apiChecking) return 'Syncing...';
    return this.apiConnected ? 'Live' : 'Offline';
  }

  get connectionTitle(): string {
    if (this.apiChecking) return 'Verifying API & SQLite WAL status...';
    return this.apiConnected
      ? 'API & SQLite WAL Online — Click to re-verify'
      : 'API Offline — Click to retry connection';
  }

  get connectionTone(): BadgeTone {
    if (this.apiChecking) return 'warning';
    return this.apiConnected ? 'success' : 'danger';
  }

  get pendingApprovalsCount(): number {
    return this.alertsState.pendingDiscounts.length + this.alertsState.pendingCreditOverrides.length;
  }

  get allResults(): GlobalSearchItem[] {
    if (!this.searchResults) return [];
    return [
      ...this.searchResults.phones,
      ...this.searchResults.accessories,
      ...this.searchResults.customers,
      ...this.searchResults.sales,
      ...this.searchResults.suppliers,
    ];
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.showNotifications || this.showProfileMenu || this.showSearchDropdown) {
        this.showNotifications = false;
        this.showProfileMenu = false;
        this.showSearchDropdown = false;
        this.activeItemIndex = -1;
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
      this.showSearchDropdown = true;
      this.showNotifications = false;
      this.showProfileMenu = false;
    }
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.searchContainer && !this.searchContainer.nativeElement.contains(target)) {
      this.showSearchDropdown = false;
      this.activeItemIndex = -1;
    }

    if (
      this.showNotifications &&
      this.notificationsContainer &&
      !this.notificationsContainer.nativeElement.contains(target)
    ) {
      this.showNotifications = false;
    }

    if (
      this.showProfileMenu &&
      this.profileContainer &&
      !this.profileContainer.nativeElement.contains(target)
    ) {
      this.showProfileMenu = false;
    }
  }

  onSearchFocus(): void {
    this.showSearchDropdown = true;
    this.showNotifications = false;
    this.showProfileMenu = false;
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSearch();
      this.searchInput?.nativeElement.blur();
      return;
    }

    const total = this.searchQuery ? this.allResults.length : this.quickCommands.length;
    if (!this.showSearchDropdown || total === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeItemIndex = (this.activeItemIndex + 1) % total;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeItemIndex = (this.activeItemIndex - 1 + total) % total;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!this.searchQuery) {
        const idx = this.activeItemIndex >= 0 ? this.activeItemIndex : 0;
        if (this.quickCommands[idx]) {
          this.runQuickCommand(this.quickCommands[idx]);
        }
        return;
      }

      if (this.activeItemIndex >= 0 && this.activeItemIndex < total) {
        this.selectResult(this.allResults[this.activeItemIndex]);
      } else if (total === 1) {
        this.selectResult(this.allResults[0]);
      }
    }
  }

  runQuickCommand(cmd: QuickCommand): void {
    this.closeSearch();
    this.router.navigate([cmd.route]);
  }

  selectResult(item: GlobalSearchItem): void {
    this.closeSearch();
    this.router.navigate([item.route], { queryParams: item.queryParams });
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.searchResults = null;
    this.hasSearched = false;
    this.activeItemIndex = -1;
    this.searchInput?.nativeElement.focus();
  }

  closeSearch(): void {
    this.showSearchDropdown = false;
    this.activeItemIndex = -1;
  }

  isItemActive(item: GlobalSearchItem): boolean {
    return (
      this.activeItemIndex >= 0 &&
      this.activeItemIndex < this.allResults.length &&
      this.allResults[this.activeItemIndex].id === item.id
    );
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    this.showProfileMenu = false;
    this.showSearchDropdown = false;
    if (this.showNotifications) {
      this.notificationsService.refresh();
    }
  }

  refreshAlerts(event?: Event): void {
    event?.stopPropagation();
    this.notificationsService.refresh();
  }

  openAlertTarget(alert: LiveAlertItem): void {
    this.showNotifications = false;
    this.router.navigate([alert.route], { queryParams: alert.queryParams });
  }

  reviewDiscount(alert: LiveAlertItem, action: 'APPROVE' | 'REJECT', event: Event): void {
    event.stopPropagation();
    if (!alert.rawDiscount) return;
    this.reviewingId = alert.id;
    this.posService.reviewDiscount(alert.rawDiscount.id, action).subscribe({
      next: () => {
        this.reviewingId = null;
        this.toast.success(
          action === 'APPROVE' ? 'Discount Approved' : 'Discount Rejected',
          `${alert.rawDiscount?.productName} request ${action === 'APPROVE' ? 'approved' : 'declined'}.`
        );
        this.notificationsService.refresh();
      },
      error: (err) => {
        this.reviewingId = null;
        this.toast.error('Review Failed', err?.error?.message || 'Could not process discount review.');
      },
    });
  }

  reviewCreditOverride(alert: LiveAlertItem, action: 'APPROVE' | 'REJECT', event: Event): void {
    event.stopPropagation();
    if (!alert.rawCreditOverride) return;
    this.reviewingId = alert.id;
    this.posService.reviewCreditOverride(alert.rawCreditOverride.id, action).subscribe({
      next: () => {
        this.reviewingId = null;
        this.toast.success(
          action === 'APPROVE' ? 'Credit Override Approved' : 'Credit Override Rejected',
          `${alert.rawCreditOverride?.customerName} override ${action === 'APPROVE' ? 'authorized' : 'declined'}.`
        );
        this.notificationsService.refresh();
      },
      error: (err) => {
        this.reviewingId = null;
        this.toast.error('Review Failed', err?.error?.message || 'Could not process credit override.');
      },
    });
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  logout(): void {
    this.showProfileMenu = false;
    this.auth.logout();
  }
}
