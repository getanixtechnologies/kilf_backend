# Environments & Git workflow

| Branch      | Environment | Deploys                                            | API URL            |
|-------------|-------------|----------------------------------------------------|--------------------|
| `feature/*` | –           | CI only (on PR)                                    | –                  |
| `develop`   | dev         | auto on push (`deploy-dev.yml`)                    | dev.api.kilf.in    |
| `main`      | production  | on push, after manual approval (`deploy-prod.yml`) | api.kilf.in        |

Flow: `feature/x` → PR into `develop` → test on dev → PR `develop` → `main` → approve prod deploy.
Hotfix: `hotfix/x` from `main` → PR into `main`, then merge `main` back into `develop`.

## How a deploy works

Both environments live on the same Hostinger VPS, run with **PM2 + native PostgreSQL + nginx** (no Docker).
GitHub Actions runs CI, then SSHes in and pipes `deploy/remote-deploy.sh`, which in the server checkout:
`git checkout <sha>` → backend `npm ci`, `prisma generate`, `build`, `prisma migrate deploy`, `pm2 reload`
→ admin-panel is skipped by default (it is hosted on Vercel; set `*_BUILD_ADMIN=true` to build it on the server).

|                 | dev                         | prod                        |
|-----------------|-----------------------------|-----------------------------|
| Checkout        | `/opt/kilf-dev`             | `PROD_DEPLOY_DIR`           |
| PM2 process     | `kilf-backend-dev`          | `kilf-backend`              |
| API port        | 4100                        | from prod `backend/.env`    |
| Database        | `kilf_dev`                  | existing prod DB            |

All config and secrets live in GitHub Environments (`dev`, `production`). Each deploy regenerates the server's `backend/.env` from them (`deploy/render-env.sh`), keeping the previous one as `.env.bak`. Never edit `.env` on the server — it will be overwritten.

## One-time setup: dev

Run on the VPS as root (dev runs under root's PM2, same as prod).

```bash
# 1. Repo access: deploy key (read-only)
ssh-keygen -t ed25519 -f /root/.ssh/github_kilf -N "" -C kilf-vps
cat /root/.ssh/github_kilf.pub   # add at GitHub repo → Settings → Deploy keys (read-only)
printf 'Host github.com\n  IdentityFile /root/.ssh/github_kilf\n' >> /root/.ssh/config

# 2. Checkout
git clone git@github.com:getanixtechnologies/kilf_backend.git /opt/kilf-dev
cd /opt/kilf-dev && git checkout develop

# 3. Database
sudo -u postgres psql -c "CREATE USER kilf_dev WITH PASSWORD 'CHANGE_ME';"
sudo -u postgres psql -c "CREATE DATABASE kilf_dev OWNER kilf_dev;"

# 4. backend/.env  (copy prod's as a template, then change DB, secrets, URLs, port)
cp <PROD_DIR>/backend/.env /opt/kilf-dev/backend/.env
nano /opt/kilf-dev/backend/.env
#   PORT=4100
#   DATABASE_URL=postgresql://kilf_dev:CHANGE_ME@localhost:5432/kilf_dev?schema=public
#   JWT_SECRET / JWT_REFRESH_SECRET = new values (openssl rand -hex 32)
#   ADMIN_URL=<Vercel dev admin URL>   API_URL=https://dev.api.kilf.in
#   Razorpay TEST keys only, or PAYMENT_PROVIDER=mock
```

5. nginx — `/etc/nginx/sites-available/kilf-dev`, then `ln -s` into `sites-enabled`,
   `nginx -t && systemctl reload nginx`, and `certbot --nginx -d dev.api.kilf.in`:
```nginx
server {
  server_name dev.api.kilf.in;
  client_max_body_size 20m;
  location / {
    proxy_pass http://127.0.0.1:4100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
DNS: A record `dev.api` → VPS IP (Hostinger hPanel → DNS).

## One-time setup: GitHub Actions SSH key

```bash
ssh-keygen -t ed25519 -f /root/gh_actions -N "" -C github-actions -q
cat /root/gh_actions.pub >> /root/.ssh/authorized_keys
cat /root/gh_actions        # paste into the GitHub secrets below, then: rm /root/gh_actions*
```

## GitHub Environments (getanixtechnologies/kilf_backend → Settings → Environments)

Create `dev` (deployment branch `develop`) and `production` (branch `main`, **Required reviewers** on).
Both use the **same names**; each environment holds its own values.

**Secrets**
| Name | Required | Notes |
|---|---|---|
| `SSH_HOST` | yes | VPS IP |
| `SSH_USER` | yes | `root` |
| `SSH_KEY` | yes | private key whose public half is in `/root/.ssh/authorized_keys` |
| `SSH_PORT` | no | default 22 |
| `DATABASE_URL` | yes | dev: `kilf_dev` DB, prod: prod DB |
| `JWT_SECRET` | yes | different per environment |
| `JWT_REFRESH_SECRET` | yes | different per environment |
| `PAYMENT_SECRET` | no | |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | if `PAYMENT_PROVIDER=razorpay` | dev: **test** keys only |

**Variables**
| Name | dev | production |
|---|---|---|
| `API_URL` | `https://dev.api.kilf.in` | `https://api.kilf.in` |
| `ADMIN_URL` | Vercel dev admin URL | prod admin URL |
| `FRONTEND_URL` | dev frontend URL | prod frontend URL |
| `PORT` | default `4100` | prod's current port (default 4000) |
| `PAYMENT_PROVIDER` | default `mock` | `razorpay` |
| `DEPLOY_DIR` | default `/opt/kilf-dev` | default `/root/kilf_backend` |
| `PM2_NAME` | default `kilf-backend-dev` | default `kilf-backend` |
| optional | `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `BOOKING_HOLD_MINUTES`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `LOG_LEVEL`, `BUILD_ADMIN` | same |
