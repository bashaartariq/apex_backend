import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface NavSection {
  title?: string;
  items: Array<{
    id: string;
    label: string;
    icon: string;
    route: string;
    badge?: string;
    badgeColor?: string;
  }>;
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

  readonly navSections: readonly NavSection[] = [
    {
      title: 'CORE PLATFORM',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2', route: '/dashboard' },
        { id: 'pos', label: 'Sales / POS', icon: 'bi-receipt-cutoff', route: '/pos', badge: 'Live', badgeColor: 'bg-primary' },
      ],
    },
    {
      title: 'INVENTORY & HARDWARE',
      items: [
        { id: 'inventory-phones', label: 'Mobile Phones', icon: 'bi-phone', route: '/inventory/phones', badge: '142', badgeColor: 'bg-light text-dark' },
        { id: 'inventory-accessories', label: 'Accessories & Parts', icon: 'bi-headphones', route: '/inventory/accessories', badge: '4 Low', badgeColor: 'bg-warning text-dark' },
        { id: 'purchases', label: 'Purchases & Stock-In', icon: 'bi-box-seam', route: '/inventory/purchases' },
        { id: 'suppliers', label: 'Suppliers', icon: 'bi-truck', route: '/inventory/suppliers' },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        { id: 'customers', label: 'Customers', icon: 'bi-people', route: '/customers' },
        { id: 'returns', label: 'Returns & Exchanges', icon: 'bi-arrow-left-right', route: '/returns' },
        { id: 'warranty', label: 'Warranty & Repairs', icon: 'bi-shield-check', route: '/warranty' },
      ],
    },
    {
      title: 'INSIGHTS & SYSTEM',
      items: [
        { id: 'reports', label: 'Reports & Analytics', icon: 'bi-bar-chart', route: '/reports' },
        { id: 'system', label: 'System & API Health', icon: 'bi-hdd-network', route: '/system', badge: 'Online', badgeColor: 'bg-success' },
        { id: 'settings', label: 'Settings', icon: 'bi-sliders2', route: '/settings' },
      ],
    },
  ];

  onNavigate(): void {
    this.closeSidebar.emit();
  }
}
