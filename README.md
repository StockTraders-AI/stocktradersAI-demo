# StockTraders AI — Dashboard

React + Vite recreation of the StockTraders AI market dashboard (Vietnamese stock-trading UI, dark theme). Responsive: a sidebar/grid layout on desktop and a drawer + bottom-tab layout on mobile (breakpoint at 768px).

## Quick start

```bash
npm install
npm run dev      # dev server on http://localhost:3000
```

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite dev server (port 3000)|
| `npm run build`   | Production build to `dist/`          |
| `npm run preview` | Preview the production build         |

## Auth environment

Google social login uses `@react-oauth/google`.

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

Add local origins to the OAuth Client's Authorized JavaScript origins:

```text
http://localhost
http://localhost:3000
http://127.0.0.1
http://127.0.0.1:3000
```

Then add the production domain before deployment.

### FPT SMS OTP

Register and forgot-password flows use serverless APIs under `/api/auth/*` so FPT credentials are never exposed to the browser.

```bash
FPT_SMS_BASE_URL=http://sandbox.sms.fpt.net
FPT_SMS_CLIENT_ID=your-fpt-client-id
FPT_SMS_CLIENT_SECRET=your-fpt-client-secret
FPT_SMS_BRANDNAME=your-registered-brandname
FPT_SMS_SCOPE=send_brandname_otp
FPT_SMS_OTP_TEMPLATE=Ma OTP StockTraders AI cua ban la {OTP}. Ma co hieu luc trong {MINUTES} phut.
FPT_SMS_OTP_SIGNING_SECRET=long-random-secret
FPT_SMS_DLR_AUTHORIZATION_KEY=secret-key-shared-with-fpt
```

Production FPT base URL can be `https://api01.sms.fpt.net`. Configure FPT's DLR callback URL as `/api/sms/dlr`.

## Project structure

```
src/
  app/
    App.jsx
    modules.js
  components/
    ui/
      Card.jsx
      Table.jsx
      Pagination.jsx
      Badges.jsx
    layout/
      Sidebar.jsx
      Topbar.jsx
      BottomNav.jsx
  features/
    dashboard/
      Dashboard.jsx
    stock-wave/
      StockWave.jsx
      WaveDonut.jsx
    smdt-branch/
      SMDTBranch.jsx
    smdt-ticker/
      SMDTTicker.jsx
    cash-flow-branch/
      CashFlowBranch.jsx
    cash-flow-ticker/
      CashFlowTicker.jsx
      IndustryPicker.jsx
      CashFlowMatrixTable.jsx
      cashFlowUtils.js
  data/
  styles/
  theme/
```

> Data is hard-coded for the UI demo — "Dữ liệu chỉ mang tính tham khảo, không phải lời khuyên đầu tư."
