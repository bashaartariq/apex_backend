import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { MobilePhone } from '../../../core/models/inventory.models';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { InventoryService } from '../../../core/services/inventory.service';

@Component({
  selector: 'app-device-detail-drawer',
  templateUrl: './device-detail-drawer.component.html',
  styleUrls: ['./device-detail-drawer.component.scss'],
})
export class DeviceDetailDrawerComponent {
  @Input() isOpen = false;
  @Input() device: MobilePhone | null = null;
  @Output() closeDrawer = new EventEmitter<void>();

  isPrintingLabel = false;

  constructor(
    public readonly auth: AuthService,
    private readonly inventoryService: InventoryService,
    private readonly toast: ToastService
  ) {}

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.isOpen) {
      this.onClose();
    }
  }

  onClose(): void {
    this.closeDrawer.emit();
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard?.writeText(text);
    this.toast.success('Copied to Clipboard', `${label}: ${text}`);
  }

  onPrintLabel(): void {
    if (!this.device || this.isPrintingLabel) return;
    this.isPrintingLabel = true;
    this.inventoryService.generateLabelPdf('PHONE', this.device.id).subscribe({
      next: (blob) => {
        this.isPrintingLabel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `label-${this.device?.imei1 || this.device?.id}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('Barcode Label Downloaded', `Thermal PDF label ready for ${this.device?.model}.`);
      },
      error: (err) => {
        this.isPrintingLabel = false;
        this.toast.error('Label Generation Failed', err?.error?.message || 'Unable to generate barcode PDF.');
      },
    });
  }

  getGrossMargin(device: MobilePhone): number {
    const sell = device.sellingPrice ?? device.selling_price ?? 0;
    const cost = device.purchasePrice ?? device.purchase_cost ?? 0;
    return sell - cost;
  }

  getGrossMarginPercent(device: MobilePhone): number {
    const sell = device.sellingPrice ?? device.selling_price ?? 0;
    const cost = device.purchasePrice ?? device.purchase_cost ?? 0;
    return sell > 0 ? ((sell - cost) / sell) * 100 : 0;
  }
}
