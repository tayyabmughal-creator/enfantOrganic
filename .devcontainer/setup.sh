#!/bin/bash
set -e

echo ""
echo "=========================================="
echo "  Enfant Organic — Codespaces Setup"
echo "=========================================="
echo ""

# ── 1. Environment file ────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env

  # In Codespaces, update API URL to use the forwarded port URL
  if [ -n "$CODESPACE_NAME" ]; then
    BACKEND_URL="https://${CODESPACE_NAME}-8000.app.github.dev"
    FRONTEND_URL="https://${CODESPACE_NAME}-3000.app.github.dev"
    sed -i "s|NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=${BACKEND_URL}/api|" .env
    sed -i "s|EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=${BACKEND_URL}/api|" .env
    echo "Codespace URLs configured:"
    echo "  Backend  : $BACKEND_URL"
    echo "  Frontend : $FRONTEND_URL"
  fi
  echo "Created .env from .env.example"
fi

# ── 2. Start DB + Redis via Docker ─────────────────────────────────────────
echo ""
echo "Starting PostgreSQL and Redis..."
docker compose up -d db redis

# Wait for DB to be ready
echo "Waiting for database..."
timeout 30 bash -c 'until docker compose exec -T db pg_isready -U enfantorganic 2>/dev/null; do sleep 1; done'
echo "Database ready."

# ── 3. Backend Python setup ────────────────────────────────────────────────
echo ""
echo "Installing Python dependencies..."
cd backend
pip install -r requirements.txt -q

echo "Running Django migrations..."
# Load env vars from root .env
export $(grep -v '^#' ../.env | grep -v '^$' | xargs) 2>/dev/null || true
export POSTGRES_HOST=127.0.0.1
export DJANGO_DEBUG=1

python manage.py migrate --noinput
python manage.py collectstatic --noinput -v 0
echo "Backend ready."
cd ..

# ── 4. Frontend Node setup ─────────────────────────────────────────────────
echo ""
echo "Installing Node.js dependencies..."
cd frontend
npm install --silent
echo "Frontend dependencies installed."
cd ..

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Setup complete! Run these commands:"
echo ""
echo "  Terminal 1 — Django backend:"
echo "    cd backend && python manage.py runserver 0.0.0.0:8000"
echo ""
echo "  Terminal 2 — Next.js frontend:"
echo "    cd frontend && npm run dev"
echo "=========================================="
echo ""
