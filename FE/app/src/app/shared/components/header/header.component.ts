import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BadgeTone } from '../status-badge/status-badge.component';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  @Input() appTitle = 'Mobile Shop Management';
  @Input() sidebarOpen = false;
  @Input() apiConnected = false;
  @Input() apiChecking = false;
  @Input() activeShopId: string | null = null;

  @Output() toggleSidebar = new EventEmitter<void>();

  get connectionLabel(): string {
    if (this.apiChecking) {
      return 'Checking API...';
    }
    return this.apiConnected ? 'API & SQLite Online' : 'API Offline';
  }

  get connectionTone(): BadgeTone {
    if (this.apiChecking) {
      return 'warning';
    }
    return this.apiConnected ? 'success' : 'danger';
  }

  onToggleClick(): void {
    this.toggleSidebar.emit();
  }
}
