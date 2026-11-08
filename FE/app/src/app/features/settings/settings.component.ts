import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ShopService } from '../../core/services/shop.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Shop } from '../../core/models/auth.models';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  shop: Shop | null = null;
  shopForm: FormGroup;
  loading = true;
  saving = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly shopService: ShopService,
    public readonly auth: AuthService,
    private readonly toast: ToastService
  ) {
    this.shopForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      ownerName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.minLength(5)]],
      address: ['', [Validators.required, Validators.minLength(3)]],
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.loading = true;
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
    });
  }

  copyTenantId(): void {
    if (this.shop?.id) {
      navigator.clipboard.writeText(this.shop.id);
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
        this.toast.error(err.error?.message || 'Failed to update shop profile.');
      },
    });
  }
}
