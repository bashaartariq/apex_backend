import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MobilePhone } from '../../../core/models/inventory.models';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-device-detail-drawer',
  templateUrl: './device-detail-drawer.component.html',
  styleUrls: ['./device-detail-drawer.component.scss'],
})
export class DeviceDetailDrawerComponent {
  @Input() isOpen = false;
  @Input() device: MobilePhone | null = null;
  @Output() closeDrawer = new EventEmitter<void>();

  constructor(private readonly toast: ToastService) {}

  onClose(): void {
    this.closeDrawer.emit();
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard?.writeText(text);
    this.toast.success('Copied to Clipboard', `${label}: ${text}`);
  }

  onPrintLabel(): void {
    if (!this.device) return;
    this.toast.info('Barcode Label Prepared', `Generated thermal label for ${this.device.model} (${this.device.imei1}).`);
  }

  getGrossMargin(device: MobilePhone): number {
    return device.sellingPrice - device.purchasePrice;
  }

  getGrossMarginPercent(device: MobilePhone): number {
    return device.sellingPrice > 0
      ? ((device.sellingPrice - device.purchasePrice) / device.sellingPrice) * 100
      : 0;
  }
}
