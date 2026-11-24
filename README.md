# Mobile Phone Shop Inventory Management & POS SaaS System

A production-grade, multi-tenant SaaS application designed for mobile phone retail shops to manage serialized device inventories, IMEI tracking, quantity accessories with chronological FIFO costing, point-of-sale transactions, discount and credit limit approval workflows, debt collection, customer profiles with encrypted CNIC, warranties, return/exchange reversals, and comprehensive executive dashboards and financial reports.

> **Status:** **All Phases Completed (Steps 1 through 5 Finalized)**  
> - **Step 1:** Foundation, Architecture & Premium Enterprise UI/UX Design System  
> - **Step 2:** Authentication & Tenant Isolation (AES-256 password hashing, JWT cookies, 20 system permissions)  
> - **Step 3:** Serialized Phones (IMEI), FIFO Accessories, Suppliers, Purchase Orders & Stock-Taking  
> - **Step 4:** POS Terminal, Split Payments, Credit Sales, Discounts, Encrypted CNIC, Returns & Warranties  
> - **Step 5:** Executive Admin Dashboard, Shopkeeper Operational Dashboard, Financial & Margin Reports, CSV & PDF Exports, and Automated Test Suite (84/84 passing backend tests).

---

## 1. System Architecture & Features

### Core Modules
1. **Multi-Tenancy & Security:**
   - Strict `shop_id` query isolation across all 36 database tables.
   - 20 granular permissions enforcing Role-Based Access Control (`SHOP_ADMIN` and `SHOPKEEPER`).
   - CNIC protection: AES-256-GCM encryption, blind indexing (`UNIQUE(shop_id, cnic_hash)`), and automatic UI masking (`XXXXX-XXXX***-*`).
   - JWT tokens with short-lived access tokens and refresh rotation.

2. **Inventory & Purchasing:**
   - **Mobile Phones:** Individually tracked physical devices with mandatory IMEI 1, optional IMEI 2, RAM, storage, color, condition (New/Used), battery health, purchase cost, and default selling price.
   - **Accessories:** Quantity-based stock tracking with barcode, SKU, category, and chronological FIFO cost batch allocations.
   - **Inward Purchase Orders:** Atomic intake of serialized phones and accessory cost batches with supplier tracking.
   - **Stock Taking & Adjustments:** Audit sessions with discrepancy tracking and mandatory movement logging.

3. **Point of Sale (POS) & Customer Transactions:**
   - Fast POS interface with instant scanner input, live search, and shopping cart.
   - Discretionary discount approval requests with shopkeeper workflow and admin authorization.
   - Multi-tender split payments (Cash, Card, Bank Transfer, JazzCash, EasyPaisa, BTC).
   - Credit sales with credit limit validation and admin override approval.
   - Return and exchange processing with automatic inventory restocking and profit reversal.
   - Warranty claim registration and repair job cards.
   - Printable PDF Invoices, Payment Receipts, and Product Barcode Labels (pure TypeScript PDF 1.4 generator).

4. **Dashboard, Reports & Business Analytics (Step 5):**
   - **Admin Dashboard:** Real-time SQLite aggregations for Today's Sales, Today's Purchases, Monthly Sales, Monthly Gross Profit, Total Inventory Valuation (Phones + FIFO Accessory Batches), Stock Units, Customer Receivables, 7-Day Performance Bar Chart, and Live Activity Feeds.
   - **Shopkeeper Dashboard:** Permitted operational metrics only (Register Sales, Personal Sales, Stock Counts, POS shortcut). Strictly omits purchase costs, valuations, and profit metrics.
   - **Granular Reports Suite:** Filterable by date presets (`today`, `yesterday`, `7d`, `30d`, `this_month`, `last_month`, `this_year`, `custom`), product type, brand, cashier, and payment method.
   - **Accurate Gross Profit:** Line-item calculation (`actual_price - unit_cost`) deducting returns and reversals so profit is never overstated.
   - **Export Engine:** Parameterized RFC 4180 CSV export with Spreadsheet Formula Injection Defense (CWE-1236) and clean landscape A4 PDF reports.

---

## 2. Technology Stack

### Frontend (`FE/app/`)
- **Framework:** Angular 14
- **Language:** TypeScript 4.7
- **UI Framework:** Bootstrap 5.3 & Bootstrap Icons
- **Architecture:** Feature modules with lazy loading (`features/dashboard`, `features/pos`, `features/inventory`, `features/reports`, `features/customers`, `features/users`)
- **State & Interceptors:** Reactive RxJS state with `ApiRequestInterceptor` handling auth bearer tokens and tenant context

### Backend (`BE/`)
- **Runtime:** Node.js (v18 LTS / v22)
- **Framework:** Express 4.x
- **Language:** TypeScript 5.7
- **Validation:** Zod 3.x
- **Database Engine:** SQLite 3 via `better-sqlite3` with Write-Ahead Logging (`WAL` mode) and enforced `foreign_keys = ON`

---

## 3. Quick Start & Setup

### 1. Installation
```bash
# Clone the repository
git clone <repo-url> mobileShop
cd mobileShop

# Configure Backend environment
cp .env.example BE/.env

# Install Backend dependencies
cd BE
npm install
cd ..

# Install Frontend dependencies
cd FE/app
npm install
cd ../..
```

### 2. Database Migration & Seeding
```bash
# Run migrations and seed baseline catalog, demo shops, and demo users
npm run db:init --prefix BE
```

### 3. Running Backend & Frontend
```bash
# Terminal 1: Start Backend (Port 3001)
npm run dev --prefix BE

# Terminal 2: Start Frontend (Port 4200)
cd FE/app
npm start
```
The application will be accessible at `http://localhost:4200`.

---

## 4. Demo Login Credentials

The seeding script generates two demo tenant stores for testing isolation:

### Tenant 1: Apex Cellular
- **Admin Account:** `admin@apex.com` / `Password123!` (Full permissions, gross profit, inventory valuation, user management)
- **Shopkeeper Account:** `keeper@apex.com` / `Password123!` (POS checkout, customers, stock lookup; costs and margins strictly hidden)

### Tenant 2: Nova Mobile Hub (Isolated Tenant)
- **Admin Account:** `owner@novamobile.com` / `Password123!`

---

## 5. Automated Test Suite (84 Passing Tests)

Run the backend automated test suite:

```bash
# Run all 4 test suites sequentially (84 tests total)
npm run test:all --prefix BE

# Or run individual test suites:
npm run test:auth --prefix BE        # Step 2: 18 Auth & Tenancy tests
npm run test:inventory --prefix BE   # Step 3: 30 Inventory, IMEI & FIFO tests
npm run test:pos --prefix BE         # Step 4: 22 POS, Split Tender & Warranty tests
npm run test:reports --prefix BE     # Step 5: 14 Dashboard, Profit & Export tests
```

---

## 6. Production Deployment Checklist

Follow this checklist when deploying the system to production:

### 1. Environment Configuration & Secret Hygiene
- [ ] Set `NODE_ENV=production` in `BE/.env`.
- [ ] Generate cryptographically random 64-character strings for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Ensure database directory (`BE/data/`) has restricted permissions (`chmod 700 BE/data`).
- [ ] Restrict `mobile_shop.sqlite` file permissions to the application user (`chmod 600 BE/data/mobile_shop.sqlite`).

### 2. SQLite Database Maintenance & WAL Backup Strategy
- [ ] **WAL Mode:** Verified enabled automatically (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`).
- [ ] **Hot Backups without downtime:** Use SQLite online backup API or SQLite CLI `.backup` command:
  ```bash
  # Cron daily backup script
  sqlite3 /path/to/BE/data/mobile_shop.sqlite ".backup '/backups/mobile_shop_$(date +%Y%m%d).sqlite'"
  ```
- [ ] **Automated WAL Checkpoints:** Set up an hourly cron job to prevent WAL file ballooning:
  ```bash
  sqlite3 /path/to/BE/data/mobile_shop.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
  ```

### 3. Process Management (PM2 Example)
```bash
# Install PM2 globally
npm install -g pm2

# Build Backend TypeScript
npm run build --prefix BE

# Start with PM2
pm2 start BE/dist/server.js --name "mobile-shop-api" --instances 1 --env NODE_ENV=production

# Save PM2 process list for auto-restart on system reboot
pm2 save
pm2 startup
```
*Note: Because SQLite is an embedded database, run the backend as a single instance (`instances: 1`) to ensure optimal WAL lock utilization.*

### 4. Reverse Proxy & HTTPS Configuration (Nginx)
Configure Nginx as a reverse proxy terminating SSL/TLS and serving the compiled Angular frontend:

```nginx
server {
    listen 80;
    server_name pos.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pos.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pos.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pos.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://pos.yourdomain.com;" always;

    # Angular Static Assets
    root /home/bashaartariq/mobileShop/FE/app/dist/mobile-shop-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy to Node.js Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }
}
```

### 5. Frontend Production Build
```bash
cd FE/app
CI=true NG_CLI_ANALYTICS=false ./node_modules/.bin/ng build --configuration production
```
Outputs optimized bundles to `FE/app/dist/mobile-shop-frontend/`.
