# Project Structure — Mobile Shop Management System

This document provides a detailed map and architectural rationale for the monorepo codebase supporting the multi-tenant Mobile Phone Shop Inventory Management and POS web application.

```text
mobileShop/
├── BE/                                  # Node.js + Express + TypeScript Backend
│   ├── data/
│   │   └── mobile_shop.sqlite           # SQLite database file (WAL mode, ignored in git)
│   ├── dist/                            # Compiled CommonJS outputs
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts              # SQLite connection (WAL, foreign_keys=ON, busy_timeout)
│   │   │   └── env.ts                   # Environment variable parsing and Zod validation
│   │   ├── controllers/
│   │   │   ├── accessories.controller.ts# Accessory catalog, categories, low-stock & FIFO batches
│   │   │   ├── auth.controller.ts       # Registration, login, logout, me, refresh token rotation
│   │   │   ├── credit-overrides.controller.ts # Manager credit limit override workflow
│   │   │   ├── customers.controller.ts  # Customers CRM, AES-256-GCM encrypted CNIC & ledger statement
│   │   │   ├── discounts.controller.ts  # Sub-default price discount request & approval workflow
│   │   │   ├── labels.controller.ts     # Instant barcode/IMEI scan lookup & printable label PDF generator
│   │   │   ├── payments.controller.ts   # Debt collection, customer receipts & sequential receipt numbering
│   │   │   ├── permissions.controller.ts# 20-permission system catalog controller
│   │   │   ├── phones.controller.ts     # Mobile phone catalog, IMEI validation & detail lookup
│   │   │   ├── purchases.controller.ts  # Inward purchase orders & atomic multi-product intake
│   │   │   ├── returns.controller.ts    # Full/partial returns, FIFO batch restoration & multi-product exchange
│   │   │   ├── sales.controller.ts      # POS product search, atomic checkout, profit tracking, invoice PDF
│   │   │   ├── shop.controller.ts       # Tenant shop profile & isolation controller
│   │   │   ├── stock-takes.controller.ts# Physical stock-taking sessions, worksheets & finalization
│   │   │   ├── stock.controller.ts      # FIFO inventory valuation summary, movements & adjustments
│   │   │   ├── suppliers.controller.ts  # Supplier directory, spend tracking & status toggles
│   │   │   ├── system.controller.ts     # Health and version endpoint controllers
│   │   │   ├── users.controller.ts      # Multi-tenant user management & permission assignment
│   │   │   └── warranty.controller.ts   # Warranty lifecycle, repair job cards, under-repair status blocking
│   │   ├── database/
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init_infrastructure.ts # Metadata schema migration
│   │   │   │   ├── 002_auth_and_multi_tenancy.ts # Shops, users, permissions, refresh_tokens
│   │   │   │   ├── 003_inventory_and_purchasing.ts # 12 tables for phones, accessories, FIFO batches, POs, audits
│   │   │   │   └── 004_pos_sales_and_customers.ts  # 14 tables for customers, POS sales, payments, receipts, returns, warranties
│   │   │   ├── seeds/
│   │   │   │   ├── 001_system_metadata.ts     # Baseline system & tenancy metadata seed
│   │   │   │   ├── 002_permissions.ts        # 20 standard module permissions + demo tenants
│   │   │   │   ├── 003_inventory_and_purchasing.ts # Standard categories, suppliers, demo PO & FIFO batches
│   │   │   │   └── 004_pos_sales_and_customers.ts  # Shop tax settings, sequence counters, demo customers with CNICs
│   │   │   ├── migrate.ts               # Migration runner with transaction support
│   │   │   ├── query.ts                 # Safe parameterized queries & immediate transactions
│   │   │   └── seed.ts                  # Seed runner
│   │   ├── middleware/
│   │   │   ├── auth.ts                  # JWT verification & DB session resolution
│   │   │   ├── authorize.ts             # Role-based & granular permission authorization
│   │   │   ├── errorHandler.ts          # Centralized error handler + custom AppError
│   │   │   ├── notFoundHandler.ts       # 404 handler for unmatched routes
│   │   │   ├── rateLimiter.ts           # In-memory sliding window auth rate limiter
│   │   │   ├── tenantContext.ts         # Multi-tenant context extraction
│   │   │   └── validateRequest.ts       # Zod-based request validation middleware
│   │   ├── routes/
│   │   │   ├── accessories.routes.ts    # /api/inventory/accessories
│   │   │   ├── auth.routes.ts           # /api/auth (register, login, logout, me, refresh)
│   │   │   ├── credit-overrides.routes.ts # /api/credit-overrides
│   │   │   ├── customers.routes.ts      # /api/customers (CRM & statements)
│   │   │   ├── discounts.routes.ts      # /api/discounts (approval workflow)
│   │   │   ├── health.routes.ts         # GET /api/health
│   │   │   ├── labels.routes.ts         # /api/products (lookup & labels)
│   │   │   ├── payments.routes.ts       # /api/payments (receipts & collection)
│   │   │   ├── permissions.routes.ts    # GET /api/permissions
│   │   │   ├── phones.routes.ts         # /api/inventory/phones
│   │   │   ├── purchases.routes.ts      # /api/purchases
│   │   │   ├── returns.routes.ts        # /api/returns (returns & exchanges)
│   │   │   ├── sales.routes.ts          # /api/sales (POS search, checkout, invoice PDF)
│   │   │   ├── shop.routes.ts           # GET/PUT /api/shop/profile
│   │   │   ├── stock-takes.routes.ts    # /api/stock-takes
│   │   │   ├── stock.routes.ts          # /api/inventory (summary, movements, adjustments, low-stock)
│   │   │   ├── suppliers.routes.ts      # /api/suppliers
│   │   │   ├── users.routes.ts          # CRUD /api/users & /api/users/:id/permissions
│   │   │   ├── version.routes.ts        # GET /api/version
│   │   │   ├── warranty.routes.ts       # /api/warranty (records & repair claims)
│   │   │   └── index.ts                 # Root /api router
│   │   ├── tests/
│   │   │   ├── auth-tenancy.test.ts     # Step 2 automated verification suite (18 tests)
│   │   │   ├── inventory-purchasing.test.ts # Step 3 automated verification suite (30 tests)
│   │   │   └── pos-sales.test.ts        # Step 4 automated verification suite (21 tests)
│   │   ├── utils/
│   │   │   ├── asyncHandler.ts          # Express async route wrapper
│   │   │   ├── cnic.ts                  # AES-256-GCM encryption, HMAC hashing & masking
│   │   │   ├── logger.ts                # Structured JSON console logger
│   │   │   ├── password.ts              # Bcrypt hashing & strength validation
│   │   │   ├── pdf-generator.ts         # Zero-dependency PDF 1.4 binary generator
│   │   │   ├── sequences.ts             # Atomic sequential numbering (INV-000001, REC-000001)
│   │   │   └── tokens.ts                # JWT token signing & revocation
│   │   ├── app.ts                       # Express application factory & middleware setup
│   │   └── server.ts                    # Server bootstrap & graceful shutdown
│   ├── package.json
│   └── tsconfig.json
│
├── FE/app/                              # Angular 14 + TypeScript Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                    # Singleton services, models, guards, interceptors
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── models/              # auth.models.ts, inventory.models.ts, pos.models.ts
│   │   │   │   └── services/            # auth, pos, customers, sales, payments, returns, warranty, inventory
│   │   │   ├── features/                # Domain feature modules
│   │   │   │   ├── auth/                # Login & Tenant Shop Registration
│   │   │   │   ├── customers/           # CRM directory, masked CNIC, financial ledger & debt collection
│   │   │   │   ├── dashboard/           # Analytics, KPI metrics & quick-actions
│   │   │   │   ├── foundation/          # System connectivity test panel
│   │   │   │   ├── inventory/           # Phones, accessories, inward purchases, suppliers, stock-taking
│   │   │   │   ├── operations/          # Returns, product exchanges, warranty repair claims
│   │   │   │   ├── pos/                 # Express POS register, barcode scanner, split payments & receipts
│   │   │   │   ├── reports/             # Reporting views & exports
│   │   │   │   ├── settings/            # Shop profile & configuration
│   │   │   │   └── users/               # Staff management & granular permission matrix
│   │   │   ├── shared/                  # Reusable UI components, header, sidebar, toast
│   │   │   ├── app-routing.module.ts
│   │   │   ├── app.component.html
│   │   │   ├── app.component.ts
│   │   │   └── app.module.ts
│   │   ├── assets/
│   │   ├── environments/
│   │   ├── styles/                      # Design tokens, variables, typography, tables, badges
│   │   └── styles.scss
│   ├── angular.json
│   ├── package.json
│   ├── proxy.conf.json
│   └── tsconfig.json
│
├── docs/
│   └── project-structure.md             # This document
└── README.md
```
