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
| `npm run start`   | Serve `dist/` and `/api/auth/*` in production |
| `npm run preview` | Preview the production build         |

## Production on VPS/nginx

Forgot-password and register OTP routes require the Node server in this repo. Do not serve only `dist/` with nginx or `vite preview`, because `/api/auth/request-otp` will not reach the FPT OTP handler.
Protected data routes require a server-side auth session cookie. Set `AUTH_SESSION_SECRET` in production so `/api/*` data endpoints can verify signed sessions.
Server-only upstream URLs, such as `PORTFOLIO_CHAT_API_URL`, should be configured without the `VITE_` prefix so they are not exposed in the browser bundle.

```bash
npm install
npm run build
PORT=3000 npm run start
```

Then proxy nginx to the Node server, or at minimum proxy `/api/` to it:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

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
AUTH_SESSION_SECRET=long-random-session-secret
FPT_SMS_BASE_URL=http://sandbox.sms.fpt.net
FPT_SMS_CLIENT_ID=your-fpt-client-id
FPT_SMS_CLIENT_SECRET=your-fpt-client-secret
FPT_SMS_BRANDNAME=your-registered-brandname
FPT_SMS_SCOPE=send_brandname_otp
FPT_SMS_OTP_TEMPLATE=Ma OTP StockTraders AI cua ban la {OTP}. Ma co hieu luc trong {MINUTES} phut.
FPT_SMS_OTP_SIGNING_SECRET=long-random-secret
FPT_SMS_DLR_AUTHORIZATION_KEY=secret-key-shared-with-fpt
FPT_SMS_OTP_PHONE_COOLDOWN_SECONDS=60
FPT_SMS_OTP_PHONE_HOURLY_LIMIT=5
FPT_SMS_OTP_PHONE_DAILY_LIMIT=2
FPT_SMS_OTP_IP_HOURLY_LIMIT=20
VITE_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
TURNSTILE_SECRET=your-cloudflare-turnstile-secret-key
```

Production FPT base URL can be `https://api01.sms.fpt.net`. Configure FPT's DLR callback URL as `/api/sms/dlr`.
Set both Turnstile keys in production to require CAPTCHA before the backend calls FPT SMS.

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
