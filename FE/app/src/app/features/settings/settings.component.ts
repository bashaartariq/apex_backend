import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ShopService, ShopTaxSettings } from '../../core/services/shop.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { Shop } from '../../core/models/auth.models';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  shop: Shop | null = null;
  taxSettings: ShopTaxSettings | null = null;
  shopForm: FormGroup;
  taxForm: FormGroup;
  loading = true;
  loadingTax = true;
  saving = false;
  savingTax = false;
  private readonly sub = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly shopService: ShopService,
    public readonly auth: AuthService,
    public readonly theme: ThemeService,
    private readonly toast: ToastService
  ) {
    this.shopForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      ownerName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.minLength(5)]],
      address: ['', [Validators.required, Validators.minLength(3)]],
    });

    this.taxForm = this.fb.group({
      taxEnabled: [true],
      taxName: ['GST / Sales Tax', [Validators.required, Validators.maxLength(40)]],
      taxRate: [5.0, [Validators.required, Validators.min(0), Validators.max(100)]],
      isTaxInclusive: [false],
    });
  }

  ngOnInit(): void {
    this.loadProfile();
    this.loadTaxSettings();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get sampleTaxCalculation(): { subtotal: number; tax: number; total: number } {
    const enabled = Boolean(this.taxForm.get('taxEnabled')?.value);
    const rate = Math.max(0, Number(this.taxForm.get('taxRate')?.value) || 0);
    const inclusive = Boolean(this.taxForm.get('isTaxInclusive')?.value);
    const base = 100;
    if (!enabled || rate === 0) {
      return { subtotal: base, tax: 0, total: base };
    }
    if (inclusive) {
      const tax = Math.round((base - base / (1 + rate / 100)) * 100) / 100;
      return { subtotal: base - tax, tax, total: base };
    }
    const tax = Math.round(base * (rate / 100) * 100) / 100;
    return { subtotal: base, tax, total: base + tax };
  }

  loadProfile(): void {
    this.loading = true;
    this.sub.add(
      this.shopService.getProfile().subscribe({
        next: (data) => {
          this.shop = data;
          this.shopForm.patchValue({
            name: data.name,
            ownerName: data.ownerName,
            phone: data.phone,
            address: data.address,
          });
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.toast.error(err.error?.message || 'Could not load shop profile.');
        },
      })
    );
  }

  loadTaxSettings(): void {
    this.loadingTax = true;
    this.sub.add(
      this.shopService.getTaxSettings().subscribe({
        next: (settings) => {
          this.taxSettings = settings;
          this.taxForm.patchValue({
            taxEnabled: settings.taxEnabled,
            taxName: settings.taxName,
            taxRate: settings.taxRate,
            isTaxInclusive: settings.isTaxInclusive,
          });
          this.loadingTax = false;
        },
        error: () => {
          this.loadingTax = false;
        },
      })
    );
  }

  copyTenantId(): void {
    if (this.shop?.id) {
      navigator.clipboard?.writeText(this.shop.id);
      this.toast.info('Copied Tenant ID to clipboard.');
    }
  }

  onSaveProfile(): void {
    if (this.shopForm.invalid) {
      this.shopForm.markAllAsTouched();
      return;
    }

    if (!this.auth.isAdmin()) {
      this.toast.error('Only Shop Administrators can edit store profile settings.');
      return;
    }

    this.saving = true;
    const formVal = this.shopForm.value;

    this.shopService.updateProfile(formVal).subscribe({
      next: (updated) => {
        this.saving = false;
        this.shop = updated;
        this.auth.updateLocalShop(updated);
        this.toast.success('Shop profile updated successfully.');
      },
      error: (err) => {
        this.saving = false;
        if (err?.error?.fieldErrors) {
          for (const [field, msg] of Object.entries(err.error.fieldErrors as Record<string, string>)) {
            const control = this.shopForm.get(field);
            if (control) {
              control.setErrors({ serverError: msg });
              control.markAsTouched();
            }
          }
        }
        this.toast.error(err.error?.message || 'Failed to update shop profile.');
      },
    });
  }

  onSaveTaxSettings(): void {
    if (this.taxForm.invalid) {
      this.taxForm.markAllAsTouched();
      return;
    }
    if (!this.auth.isAdmin()) {
      this.toast.error('Only Shop Administrators can update tax settings.');
      return;
    }

    this.savingTax = true;
    const val = this.taxForm.value;
    this.shopService
      .updateTaxSettings({
        taxEnabled: Boolean(val.taxEnabled),
        taxName: String(val.taxName || 'Sales Tax').trim(),
        taxRate: Number(val.taxRate) || 0,
        isTaxInclusive: Boolean(val.isTaxInclusive),
      })
      .subscribe({
        next: (updated) => {
          this.savingTax = false;
          this.taxSettings = updated;
          this.toast.success('Tax Configuration Saved', `POS will apply ${updated.taxEnabled ? updated.taxRate + '% ' + updated.taxName : '0% tax'}.`);
        },
        error: (err) => {
          this.savingTax = false;
          this.toast.error(err.error?.message || 'Failed to update tax configuration.');
        },
      });
  }
}
