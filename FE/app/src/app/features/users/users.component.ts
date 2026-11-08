import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserManagementService } from '../../core/services/user-management.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionDefinition, StaffUser } from '../../core/models/auth.models';

interface ModulePermissionsGroup {
  module: string;
  permissions: PermissionDefinition[];
}

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
})
export class UsersComponent implements OnInit {
  staffList: StaffUser[] = [];
  filteredStaff: StaffUser[] = [];
  permissionsCatalog: PermissionDefinition[] = [];
  groupedPermissions: ModulePermissionsGroup[] = [];

  loading = true;
  searchQuery = '';
  activeFilter: 'ALL' | 'SHOP_ADMIN' | 'SHOPKEEPER' = 'ALL';

  // Modal states
  showAddModal = false;
  showEditModal = false;
  showPermsModal = false;
  submitting = false;

  // Selected user for edit/perms
  selectedUser: StaffUser | null = null;
  selectedUserPerms: Set<string> = new Set();

  // Forms
  addStaffForm: FormGroup;
  editStaffForm: FormGroup;

  constructor(
    private readonly userMgmt: UserManagementService,
    public readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly fb: FormBuilder
  ) {
    this.addStaffForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      password: ['', [Validators.required, Validators.minLength(8)]],
      role: ['SHOPKEEPER', [Validators.required]],
    });

    this.editStaffForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: [''],
      role: ['SHOPKEEPER', [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.loadCatalog();
    this.loadStaff();
  }

  get activeStaffCount(): number {
    return this.staffList.filter((u) => u.status === 'ACTIVE').length;
  }

  get shopkeeperCount(): number {
    return this.staffList.filter((u) => u.role === 'SHOPKEEPER').length;
  }

  get adminCount(): number {
    return this.staffList.filter((u) => u.role === 'SHOP_ADMIN').length;
  }

  loadCatalog(): void {
    this.userMgmt.getPermissionsCatalog().subscribe({
      next: (perms) => {
        this.permissionsCatalog = perms;
        this.groupPermissions(perms);
      },
      error: () => {
        this.toast.error('Could not load permissions catalog.');
      },
    });
  }

  groupPermissions(perms: PermissionDefinition[]): void {
    const map = new Map<string, PermissionDefinition[]>();
    for (const p of perms) {
      const list = map.get(p.module) || [];
      list.push(p);
      map.set(p.module, list);
    }
    this.groupedPermissions = Array.from(map.entries()).map(([module, permissions]) => ({
      module,
      permissions,
    }));
  }

  loadStaff(): void {
    this.loading = true;
    this.userMgmt.listUsers().subscribe({
      next: (users) => {
        this.staffList = users;
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.message || 'Failed to load staff roster.');
      },
    });
  }

  applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredStaff = this.staffList.filter((u) => {
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q));
      const matchesRole = this.activeFilter === 'ALL' || u.role === this.activeFilter;
      return matchesSearch && matchesRole;
    });
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.applyFilter();
  }

  setRoleFilter(filter: 'ALL' | 'SHOP_ADMIN' | 'SHOPKEEPER'): void {
    this.activeFilter = filter;
    this.applyFilter();
  }

  // --- Modal Open Handlers ---
  openAddModal(): void {
    this.addStaffForm.reset({ role: 'SHOPKEEPER' });
    this.selectedUserPerms.clear();
    // Default sensible shopkeeper permissions
    ['dashboard.view', 'pos.access', 'inventory.view', 'customers.view'].forEach((p) =>
      this.selectedUserPerms.add(p)
    );
    this.showAddModal = true;
  }

  openEditModal(user: StaffUser): void {
    this.selectedUser = user;
    this.editStaffForm.patchValue({
      name: user.name,
      phone: user.phone || '',
      role: user.role,
    });
    this.showEditModal = true;
  }

  openPermsModal(user: StaffUser): void {
    this.selectedUser = user;
    this.selectedUserPerms = new Set(user.permissions || []);
    this.showPermsModal = true;
  }

  closeModals(): void {
    this.showAddModal = false;
    this.showEditModal = false;
    this.showPermsModal = false;
    this.selectedUser = null;
    this.submitting = false;
  }

  // --- Permission Toggles ---
  togglePerm(permId: string): void {
    if (this.selectedUserPerms.has(permId)) {
      this.selectedUserPerms.delete(permId);
    } else {
      this.selectedUserPerms.add(permId);
    }
  }

  selectAllPerms(): void {
    this.permissionsCatalog.forEach((p) => this.selectedUserPerms.add(p.id));
  }

  clearAllPerms(): void {
    this.selectedUserPerms.clear();
  }

  // --- Form Submissions ---
  submitAddStaff(): void {
    if (this.addStaffForm.invalid) {
      this.addStaffForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const val = this.addStaffForm.value;

    this.userMgmt
      .createUser({
        name: val.name,
        email: val.email,
        phone: val.phone || null,
        password: val.password,
        role: val.role,
        permissions: Array.from(this.selectedUserPerms),
      })
      .subscribe({
        next: (created) => {
          this.submitting = false;
          this.toast.success(`Staff member "${created.name}" created.`);
          this.closeModals();
          this.loadStaff();
        },
        error: (err) => {
          this.submitting = false;
          this.toast.error(err.error?.message || 'Could not create staff account.');
        },
      });
  }

  submitEditStaff(): void {
    if (!this.selectedUser || this.editStaffForm.invalid) {
      return;
    }

    this.submitting = true;
    const val = this.editStaffForm.value;

    this.userMgmt
      .updateUser(this.selectedUser.id, {
        name: val.name,
        phone: val.phone || null,
        role: val.role,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.toast.success('Staff details updated.');
          this.closeModals();
          this.loadStaff();
        },
        error: (err) => {
          this.submitting = false;
          this.toast.error(err.error?.message || 'Could not update staff member.');
        },
      });
  }

  savePermissions(): void {
    if (!this.selectedUser) return;

    this.submitting = true;
    const perms = Array.from(this.selectedUserPerms);

    this.userMgmt.updateUserPermissions(this.selectedUser.id, perms).subscribe({
      next: () => {
        this.submitting = false;
        this.toast.success(`Permissions updated for ${this.selectedUser?.name}.`);
        this.closeModals();
        this.loadStaff();
      },
      error: (err) => {
        this.submitting = false;
        this.toast.error(err.error?.message || 'Could not update permissions.');
      },
    });
  }

  toggleUserStatus(user: StaffUser): void {
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.userMgmt.updateStatus(user.id, newStatus).subscribe({
      next: () => {
        this.toast.info(`Account status changed to ${newStatus}.`);
        user.status = newStatus;
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Could not update user status.');
      },
    });
  }
}
