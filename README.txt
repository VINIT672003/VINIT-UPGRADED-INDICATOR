RENDER BACKEND STARTER

Files included:
- package.json
- server.js
- db.js
- middleware.js
- seed-owner.js
- .env.example
- render.yaml

What this backend supports:
- Health check: /api/health
- Register: POST /api/auth/register
- Login: POST /api/auth/login
- Plans list: GET /api/plans
- User dashboard: GET /api/dashboard
- Create payment: POST /api/payments/create
- Admin payments list: GET /api/admin/payments

Before deploy:
1. Run your Supabase SQL schema.
2. Copy DATABASE_URL from Supabase.
3. Add env vars in Render.
4. Deploy.
5. Test /api/health.
