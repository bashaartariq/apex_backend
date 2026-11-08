import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MockDataService } from '../../core/services/mock-data.service';
import { ToastService } from '../../core/services/toast.service';
import { Customer } from '../../core/models/inventory.models';

@Component({
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss'],
})
export class CustomersComponent implements OnInit {
  customers: Customer[] = [];
  filteredCustomers: Customer[] = [];
  searchControl = new FormControl('');

  showAddModal = false;
  newName = '';
  newPhone = '';
  newEmail = '';

  constructor(
    private readonly mockData: MockDataService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.mockData.customers$.subscribe((c) => {
      this.customers = c;
      this.applyFilter();
    });

    this.searchControl.valueChanges.subscribe(() => this.applyFilter());
  }

  applyFilter(): void {
    const term = (this.searchControl.value || '').trim().toLowerCase();
    this.filteredCustomers = this.customers.filter(
      (c) =>
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.registeredImeis.some((imei) => imei.includes(term))
    );
  }

  openAddModal(): void {
    this.newName = '';
    this.newPhone = '';
    this.newEmail = '';
    this.showAddModal = true;
  }

  saveCustomer(): void {
    if (!this.newName || !this.newPhone) return;
    const created: Customer = {
      id: `CUST-${100 + this.customers.length + 1}`,
      name: this.newName,
      phone: this.newPhone,
      email: this.newEmail || `${this.newName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
      loyaltyTier: 'Standard',
      totalSpent: 0,
      totalVisits: 1,
      lastVisit: 'Today',
      registeredImeis: [],
    };
    this.customers.push(created);
    this.applyFilter();
    this.showAddModal = false;
    this.toast.success('Customer Registered', `${created.name} added to retail CRM.`);
  }
}
