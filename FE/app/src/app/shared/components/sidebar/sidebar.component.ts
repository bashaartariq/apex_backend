import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  badge?: string;
  badgeColor?: string;
  permission?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() isOpen = false;
  @Input() isCollapsed = false;
  @Input() activeShopId: string | null = null;
  @Output() closeSidebar = new EventEmitter<void>();

  private readonly rawSections: readonly NavSection[] = [
    {
      title: 'CORE PLATFORM',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2', route: '/dashboard', permission: 'dashboard.view' },
        { id: 'pos', label: 'Sales / POS', icon: 'bi-receipt-cutoff', route: '/pos', badge: 'Live', badgeColor: 'bg-primary', permission: 'pos.access' },
      ],
    },
    {
      title: 'INVENTORY & HARDWARE',
      items: [
        { id: 'inventory-phones', label: 'Mobile Phones', icon: 'bi-phone', route: '/inventory/phones', badge: 'Phones', badgeColor: 'bg-light text-dark', permission: 'phones.view' },
        { id: 'inventory-accessories', label: 'Accessories & Parts', icon: 'bi-headphones', route: '/inventory/accessories', badge: 'Parts', badgeColor: 'bg-warning text-dark', permission: 'accessories.view' },
        { id: 'purchases', label: 'Purchases & Stock-In', icon: 'bi-box-seam', route: '/inventory/purchases', permission: 'purchases.view' },
        { id: 'suppliers', label: 'Suppliers', icon: 'bi-truck', route: '/inventory/suppliers', permission: 'suppliers.view' },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        { id: 'customers', label: 'Customers', icon: 'bi-people', route: '/customers', permission: 'customers.view' },
        { id: 'returns', label: 'Returns & Exchanges', icon: 'bi-arrow-left-right', route: '/returns', permission: 'returns.manage' },
        { id: 'warranty', label: 'Warranty & Repairs', icon: 'bi-shield-check', route: '/warranty', permission: 'warranty.manage' },
      ],
    },
    {
      title: 'INSIGHTS & SYSTEM',
      items: [
        { id: 'reports', label: 'Reports & Analytics', icon: 'bi-bar-chart', route: '/reports', permission: 'reports.view' },
        { id: 'users', label: 'Staff Management', icon: 'bi-people', route: '/users', permission: 'users.manage' },
        { id: 'settings', label: 'Store Settings', icon: 'bi-sliders2', route: '/settings', permission: 'settings.manage' },
        { id: 'system', label: 'System & API Health', icon: 'bi-hdd-network', route: '/system', badge: 'Online', badgeColor: 'bg-success' },
      ],
    },
  ];

  constructor(public readonly auth: AuthService) {}

  get navSections(): NavSection[] {
    if (this.auth.isAdmin()) {
      return this.rawSections as NavSection[];
    }

    // Filter items according to shopkeeper permissions
    return this.rawSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!item.permission) return true;
          return this.auth.hasPermission(item.permission);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }

  onNavigate(): void {
    if (this.isOpen) {
      this.closeSidebar.emit();
    }
  }
}
