# sparkart

Minimal React (Vite) setup for deployment to Cloudflare Pages.

## Local development

```bash
npm install
npm run dev
```

## Cloudflare Pages settings

- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist
- Root directory: / (repo root)

public/_redirects is included for SPA direct-route support.
