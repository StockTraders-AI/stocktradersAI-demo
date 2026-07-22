# Nginx Production Setup

This project is built as a React + Vite app and served from Docker on `127.0.0.1:3000`.

The `vite.config.js` `server.proxy` block is only used by `npm run dev`. After `npm run build`, Vite no longer runs and its proxy has no effect. Production proxying must be configured in the VPS Nginx instance.

## Important API Note

The Docker container in this setup serves:

- the built `dist` directory,
- SPA fallback for route refreshes,
- the project `api/*.js` handlers under `/api/...`.

This is required because the frontend currently calls `/api/...` paths such as `/api/total-trade-real`. If `/api/...` is not handled by the Docker container or another backend, Nginx will forward the request to the SPA and the browser will receive `index.html` instead of JSON. That causes errors like:

```txt
SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

## Example Nginx Config

Replace `your-domain.com` with the real domain.

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /service/ {
        proxy_pass https://stocktraders.vn/service/;
        proxy_ssl_server_name on;

        proxy_set_header Host stocktraders.vn;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /stocktraders-api/ {
        rewrite ^/stocktraders-api/(.*)$ /$1 break;

        proxy_pass https://stocktraders.vn;
        proxy_ssl_server_name on;

        proxy_set_header Host stocktraders.vn;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Must be placed before the generic /api/ location.
    location = /api/portfolio-chat {
        proxy_pass http://112.213.91.235:8000/api/portfolio-chat;

        proxy_http_version 1.1;
        proxy_set_header Host 112.213.91.235;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://112.213.91.235:3005/socket.io/;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host 112.213.91.235;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Current App `/api/*` Paths

The Docker container handles these paths:

- `/api/smdt`
- `/api/smdt-ticker`
- `/api/stock-wave`
- `/api/stock-wave-history`
- `/api/cashflow-branch`
- `/api/cashflow-ticker`
- `/api/total-trade`
- `/api/total-trade-real`
- `/api/stock-signal`
- `/api/branch-path`

These routes are implemented by `server.mjs`, which adapts the existing `api/*.js` handlers for Docker runtime.

`/api/portfolio-chat` is different: it is configured by `VITE_PORTFOLIO_CHAT_API_URL` and should proxy to the Portfolio Chat backend. Use a same-origin value at build time:

```env
VITE_PORTFOLIO_CHAT_API_URL=/api/portfolio-chat
```

Do not build production with an absolute `http://...` portfolio chat URL if the app is served over HTTPS. The browser will call that URL directly, which can cause mixed-content or CORS failures and bypasses your domain Nginx proxy.

## Socket.IO Realtime

Some modules connect to Socket.IO namespace `/realtime`.

Important: with Socket.IO, `/realtime` is the namespace. The HTTP/WebSocket transport endpoint is still `/socket.io/`.

In HTTPS production, `src/data/realtimeUrl.js` falls back from the default `http://112.213.91.235:3005/realtime` to same-origin `/realtime` to avoid mixed-content blocking. The browser will then connect to:

```txt
wss://your-domain.com/socket.io/?EIO=4&transport=websocket
```

Therefore Nginx must proxy `/socket.io/` to the realtime server. Without that block, the request can fall through to the React app server and Socket.IO will report errors such as:

```txt
Socket.IO connection error: server error
```

If you use another realtime host, change the upstream in `location /socket.io/` accordingly.

## Test And Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Smoke Tests

```bash
curl -I http://127.0.0.1:3000
curl -I http://your-domain.com
curl -I http://your-domain.com/api/total-trade-real
curl -I http://your-domain.com/api/portfolio-chat
curl -I http://your-domain.com/service/data/getStockWave
curl -I http://your-domain.com/stocktraders-api/service/data/getStockWave
```

For Socket.IO, check the browser DevTools Network tab. The `/socket.io/` request should return `101 Switching Protocols` for websocket transport, or `200` for polling transport if fallback is used.

For SPA routing, open a nested route in the browser and refresh. The Docker container serves `dist/index.html` as the fallback for app routes.
