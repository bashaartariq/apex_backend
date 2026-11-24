import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  submitting = false;
  showPassword = false;
  errorMessage: string | null = null;
  returnUrl = '/dashboard';

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    const rawReturn = this.route.snapshot.queryParams['returnUrl'];
    if (rawReturn && !rawReturn.includes('/login') && !rawReturn.includes('/register')) {
      this.returnUrl = rawReturn;
    } else {
      this.returnUrl = '/dashboard';
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  fillDemo(email: string): void {
    if (this.submitting) return;
    this.loginForm.patchValue({
      email,
      password: 'Password123!',
    });
  }

  onSubmit(): void {
    if (this.submitting) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.errorMessage = null;

    const { email, password } = this.loginForm.value;

    this.auth.login({ email, password }).subscribe({
      next: (_res) => {
        this.submitting = false;

        let target = this.returnUrl && !this.returnUrl.includes('/login') ? this.returnUrl : '/dashboard';

        // Intelligent redirect if shopkeeper lacks dashboard.view but has pos.access
        if (
          !this.auth.isAdmin() &&
          !this.auth.hasPermission('dashboard.view') &&
          this.auth.hasPermission('pos.access')
        ) {
          target = '/pos';
        }

        this.router.navigateByUrl(target).catch(() => {
          this.router.navigate(['/dashboard']);
        });
      },
      error: (err) => {
        this.submitting = false;
        const msg =
          err.error?.message ||
          err.message ||
          (err.status === 0
            ? 'Unable to connect to authentication server. Please check backend.'
            : 'Invalid email or password. Please try again.');
        this.errorMessage = msg;
        this.toast.error(msg);
      },
    });
  }
}
