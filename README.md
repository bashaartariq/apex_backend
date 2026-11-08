# Mobile Phone Shop Inventory Management & POS System

A modern, multi-tenant web application designed for mobile phone retail shops to manage device inventories, IMEI tracking, point-of-sale transactions, warranties, and multi-tenant store operations.

> **Status:** Step 1 Foundation & UI/UX Design System Completed. **Step 2: Authentication & Multi-Tenancy Completed** (Strict tenant isolation, JWT + HttpOnly refresh token rotation, bcrypt password hashing, role & 20-permission authorization matrix, shop registration, staff directory, and profile management).

---

## 1. Technology Stack

### Frontend
- **Framework:** Angular 14
- **Language:** TypeScript
- **Routing:** Angular Router with custom `TitleStrategy`
- **Forms:** Angular Reactive Forms
- **UI Framework:** Bootstrap 5.3 & Bootstrap Icons
- **Design:** Responsive mobile-first layout with WCAG 2.2 Level AA accessibility compliance

### Backend
- **Platform:** Node.js (v18+ or v22+)
- **Framework:** Express 4.x
- **Language:** TypeScript 5.x
- **Validation:** Zod 3.x
- **Architecture:** RESTful API with centralized error handling and tenant context resolution

### Database
- **Engine:** SQLite 3 via `better-sqlite3`
- **Concurrency:** Write-Ahead Logging (`WAL` mode)
- **Integrity:** `foreign_keys = ON` strictly enforced
- **Safety:** Parameterized prepared statements preventing SQL injection
- **Transactions:** Atomic `IMMEDIATE` transaction helpers
- **Lifecycle:** Automated schema migration and seeding runner

---

## 2. Prerequisites

- **Node.js:** v18.0.0 or later (v22 LTS recommended)
- **npm:** v9.0.0 or later
- **Git**

---

## 3. Installation Instructions

### Clone & Root Setup
```bash
# Clone the repository
git clone <repo-url> mobileShop
cd mobileShop

# Copy environment variables
cp .env.example .env
cp .env.example BE/.env
```

### Install Backend Dependencies
```bash
cd BE
npm install
cd ..
```

### Install Frontend Dependencies
```bash
cd FE/app
npm install
cd ../..
```

---

## 4. Database Initialization

Run the automated migration and seed suite to initialize the SQLite database:

```bash
# Using root convenience command:
npm run db:init

# Or directly in the backend directory:
cd BE
npm run db:init
```

This ensures:
1. `BE/data/mobile_shop.sqlite` is created.
2. WAL mode and foreign key enforcement are enabled.
3. Baseline migration (`001_init_infrastructure`) is recorded in `_migrations`.
4. Baseline metadata seed (`001_system_metadata`) is recorded in `_seeds`.

---

## 5. Running the Application

### Option A: Run Backend & Frontend Separately

#### Terminal 1 — Start Express Backend Server
```bash
# From workspace root
npm run start:backend

# Or from BE/
cd BE
npm run dev
```
Backend will be live at `http://localhost:3000`.

#### Terminal 2 — Start Angular Frontend Dev Server
```bash
# From workspace root
npm run start:frontend

# Or from FE/app/
cd FE/app
npm start
```
Frontend will be live at `http://localhost:4200`.

---

## 6. Development URLs & API Endpoints

| Service / Endpoint | Method | URL | Description |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | `GET` | `http://localhost:4200` | Application shell with live connectivity card |
| **Backend Health Check** | `GET` | `http://localhost:3000/api/health` | Verifies Express server and live SQLite connection |
| **Backend Version Info** | `GET` | `http://localhost:3000/api/version` | Reports API name, version, Node.js version, and stage |

### Example Health Response (`GET /api/health`):
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2026-11-08T13:21:31.741Z",
  "uptimeSeconds": 14.28,
  "environment": "development",
  "database": {
    "connected": true,
    "engine": "sqlite",
    "foreignKeysEnabled": true,
    "appliedMigrations": 1
  },
  "tenancy": {
    "mode": "shared-database",
    "discriminator": "shop_id"
  }
}
```

---

## 7. Multi-Tenant Architecture Foundation

The system uses a **shared database** with a discriminator column (`shop_id`).
- Incoming HTTP requests pass through the `attachTenantContext` middleware which inspects `X-Shop-Id`.
- Angular's `ApiRequestInterceptor` automatically attaches the active tenant's `X-Shop-Id` header to every outgoing API request.
- Database queries use the `requireShopId` utility to ensure queries are strictly partitioned by shop.

---

## 8. Verification & Test Commands

To verify full build integrity:

```bash
# Verify backend TypeScript compilation:
npm --prefix BE run build

# Verify frontend Angular build:
npm --prefix FE/app run build
```
