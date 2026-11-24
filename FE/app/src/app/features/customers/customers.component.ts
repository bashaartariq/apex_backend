import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CustomersService } from '../../core/services/customers.service';
import { PaymentsService } from '../../core/services/payments.service';
import { SalesService } from '../../core/services/sales.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { Customer, CustomerStatement, PaymentReceipt } from '../../core/models/pos.models';
import { isValidCnic, isValidPhone, isValidEmail } from '../../shared/utils/formatters';

@Component({
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss'],
})
export class CustomersComponent implements OnInit, OnDestroy {
  customers: Customer[] = [];
  filteredCustomers: Customer[] = [];
  searchControl = new FormControl('');
  statusFilter = 'ALL';
  isLoading = false;
  private readonly sub = new Subscription();

  // Add / Edit Modal
  showModal = false;
  isEditing = false;
  editingId: string | null = null;
  formName = '';
  formPhone = '';
  formCnic = '';
  formEmail = '';
  formAddress = '';
  formCreditLimit = 0;
  formNotes = '';
  formStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';
  fieldErrors: Record<string, string> = {};

  // Statement / Details Drawer & CNIC Privacy
  showStatementDrawer = false;
  selectedCustomer: Customer | null = null;
  customerStatement: CustomerStatement | null = null;
  isLoadingStatement = false;
  isCnicRevealed = false;
  revealedCnic: string | null = null;
  isRevealingCnic = false;

  // Collect Payment Modal
  showCollectPaymentModal = false;
  selectedInvoiceId = '';
  selectedInvoiceBalance = 0;
  paymentAmount = 0;
  paymentMethod = 'CASH';
  paymentReference = '';
  paymentNotes = '';
  paymentError: string | null = null;
  isProcessingPayment = false;

  constructor(
    private readonly customersService: CustomersService,
    private readonly paymentsService: PaymentsService,
    private readonly salesService: SalesService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute,
    public readonly auth: AuthService
  ) {}

  get totalReceivables(): number {
    return this.customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
  }

  get activeDebtorsCount(): number {
    return this.customers.filter((c) => (c.outstandingBalance || 0) > 0).length;
  }

  get verifiedCnicCount(): number {
    return this.customers.filter((c) => !!c.cnicMasked || !!c.hasCnic).length;
  }

  get totalCreditExtended(): number {
    return this.customers.reduce((sum, c) => sum + (c.creditLimit || 0), 0);
  }

  getCreditUtilizationPct(c: Customer): number {
    if (!c.creditLimit || c.creditLimit <= 0) return 0;
    return Math.min(100, Math.round((c.outstandingBalance / c.creditLimit) * 100));
  }

  ngOnInit(): void {
    this.loadCustomers();

    this.sub.add(
      this.searchControl.valueChanges
        .pipe(debounceTime(250), distinctUntilChanged())
        .subscribe(() => this.applyFilter())
    );

    this.sub.add(
      this.route.queryParams.subscribe((params) => {
        if (params['search']) {
          this.searchControl.setValue(params['search']);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.showCollectPaymentModal) {
      this.showCollectPaymentModal = false;
      return;
    }
    if (this.showStatementDrawer) {
      this.showStatementDrawer = false;
      return;
    }
    if (this.showModal) {
      this.showModal = false;
    }
  }

  loadCustomers(): void {
    this.isLoading = true;
    this.customersService.getCustomers().subscribe({
      next: (data) => {
        this.customers = data;
        this.applyFilter();
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.toast.error('Failed to load customers: ' + (err.error?.message || err.message));
      },
    });
  }

  applyFilter(): void {
    const term = (this.searchControl.value || '').trim().toLowerCase();
    this.filteredCustomers = this.customers.filter((c) => {
      const matchSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        (c.phone && c.phone.toLowerCase().includes(term)) ||
        (c.cnicMasked && c.cnicMasked.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term));

      const matchStatus =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'DEBTORS' ? (c.outstandingBalance || 0) > 0 : c.status === this.statusFilter);

      return matchSearch && matchStatus;
    });
  }

  setStatusFilter(status: string): void {
    this.statusFilter = status;
    this.applyFilter();
  }

  openAddModal(): void {
    this.isEditing = false;
    this.editingId = null;
    this.formName = '';
    this.formPhone = '';
    this.formCnic = '';
    this.formEmail = '';
    this.formAddress = '';
    this.formCreditLimit = 0;
    this.formNotes = '';
    this.formStatus = 'ACTIVE';
    this.fieldErrors = {};
    this.showModal = true;
  }

  openEditModal(c: Customer, event: Event): void {
    event.stopPropagation();
    this.isEditing = true;
    this.editingId = c.id;
    this.formName = c.name;
    this.formPhone = c.phone || '';
    this.formCnic = c.cnicMasked || '';
    this.formEmail = c.email || '';
    this.formAddress = c.address || '';
    this.formCreditLimit = c.creditLimit || 0;
    this.formNotes = c.notes || '';
    this.formStatus = c.status;
    this.fieldErrors = {};
    this.showModal = true;
  }

  saveCustomer(): void {
    this.fieldErrors = {};

    // 1. Full Name validation
    const name = (this.formName || '').trim();
    if (!name || name.length < 2) {
      this.fieldErrors['name'] = 'Please enter a customer name (at least 2 characters).';
    }

    // 2. Phone validation (optional, but if provided must be valid format)
    const phone = (this.formPhone || '').trim();
    if (phone && !isValidPhone(phone)) {
      this.fieldErrors['phone'] = 'Please enter a valid phone number.';
    }

    // 3. CNIC validation (optional, but if provided must be 13 digits)
    const cnic = (this.formCnic || '').trim();
    if (cnic && !cnic.includes('*') && !isValidCnic(cnic)) {
      this.fieldErrors['cnic'] = 'Please enter a valid 13-digit CNIC number.';
    }

    // 4. Email validation (optional, but if provided must be valid email)
    const email = (this.formEmail || '').trim();
    if (email && !isValidEmail(email)) {
      this.fieldErrors['email'] = 'Please enter a valid email address.';
    }

    if (Object.keys(this.fieldErrors).length > 0) {
      this.toast.warning('Please correct the highlighted form errors.');
      return;
    }

    const payload: any = {
      name,
      phone,
      cnic: cnic.includes('*') ? undefined : cnic,
      email,
      address: (this.formAddress || '').trim(),
      creditLimit: Math.max(0, Number(this.formCreditLimit) || 0),
      notes: (this.formNotes || '').trim(),
      status: this.formStatus,
    };

    if (this.isEditing && this.editingId) {
      this.customersService.updateCustomer(this.editingId, payload).subscribe({
        next: (_updated) => {
          this.toast.success('Customer updated successfully');
          this.showModal = false;
          this.loadCustomers();
        },
        error: (err) => {
          if (err.error?.fieldErrors) {
            this.fieldErrors = err.error.fieldErrors;
          }
          this.toast.error(err.error?.message || err.message || 'Failed to update customer.');
        },
      });
    } else {
      this.customersService.createCustomer(payload).subscribe({
        next: (_created) => {
          this.toast.success('Customer registered successfully');
          this.showModal = false;
          this.loadCustomers();
        },
        error: (err) => {
          if (err.error?.fieldErrors) {
            this.fieldErrors = err.error.fieldErrors;
          }
          this.toast.error(err.error?.message || err.message || 'Failed to create customer.');
        },
      });
    }
  }

  viewStatement(customer: Customer): void {
    this.selectedCustomer = customer;
    this.isCnicRevealed = false;
    this.revealedCnic = null;
    this.isLoadingStatement = true;
    this.showStatementDrawer = true;

    this.customersService.getCustomerStatement(customer.id).subscribe({
      next: (stmt) => {
        this.customerStatement = stmt;
        this.isLoadingStatement = false;
      },
      error: (err) => {
        this.isLoadingStatement = false;
        this.toast.error('Failed to load customer statement: ' + (err.error?.message || err.message));
      },
    });
  }

  toggleRevealCnic(): void {
    if (this.isCnicRevealed) {
      this.isCnicRevealed = false;
      this.revealedCnic = null;
      return;
    }
    if (!this.selectedCustomer || !this.selectedCustomer.hasCnic) {
      return;
    }
    this.isRevealingCnic = true;
    this.customersService.revealCnic(this.selectedCustomer.id).subscribe({
      next: (res) => {
        this.isRevealingCnic = false;
        this.revealedCnic = res.cnic;
        this.isCnicRevealed = true;
      },
      error: (err) => {
        this.isRevealingCnic = false;
        this.toast.error('Unable to decrypt CNIC: ' + (err.error?.message || err.message));
      },
    });
  }

  openCollectPayment(sale: any, event: Event): void {
    event.stopPropagation();
    this.selectedInvoiceId = sale.id;
    this.selectedInvoiceBalance = sale.balanceDue;
    this.paymentAmount = sale.balanceDue;
    this.paymentMethod = 'CASH';
    this.paymentReference = '';
    this.paymentNotes = '';
    this.paymentError = null;
    this.showCollectPaymentModal = true;
  }

  submitPayment(): void {
    this.paymentError = null;

    if (this.paymentAmount <= 0) {
      this.paymentError = 'Payment amount must be greater than zero.';
      this.toast.warning(this.paymentError);
      return;
    }

    if (this.paymentAmount > this.selectedInvoiceBalance) {
      this.paymentError = `Amount cannot exceed the invoice balance of $${this.selectedInvoiceBalance.toFixed(2)}.`;
      this.toast.warning(this.paymentError);
      return;
    }

    this.isProcessingPayment = true;
    this.paymentsService
      .recordPayment(this.selectedInvoiceId, {
        paymentMethod: this.paymentMethod,
        amount: Number(this.paymentAmount),
        transactionReference: this.paymentReference,
        notes: this.paymentNotes,
      })
      .subscribe({
        next: (receipt) => {
          this.isProcessingPayment = false;
          this.showCollectPaymentModal = false;
          this.toast.success(`Payment recorded! Receipt: ${receipt.receiptNo}`);
          // Refresh statement
          if (this.selectedCustomer) {
            this.viewStatement(this.selectedCustomer);
            this.loadCustomers();
          }
        },
        error: (err) => {
          this.isProcessingPayment = false;
          this.paymentError = err.error?.message || err.message || 'Payment collection failed.';
          this.toast.error(this.paymentError || 'Payment collection failed.');
        },
      });
  }

  downloadReceiptPdf(receiptId: string): void {
    this.paymentsService.downloadReceiptPdf(receiptId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt-${receiptId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Failed to download receipt PDF'),
    });
  }

  downloadInvoicePdf(saleId: string, invoiceNo: string, event: Event): void {
    event.stopPropagation();
    this.salesService.downloadInvoicePdf(saleId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNo}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Failed to download invoice PDF'),
    });
  }

  copyRevealedCnic(): void {
    if (!this.revealedCnic) return;
    navigator.clipboard?.writeText(this.revealedCnic);
    this.toast.success('Copied', 'Decrypted CNIC copied to clipboard.');
  }
}
