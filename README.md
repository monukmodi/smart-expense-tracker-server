# Smart Expense Tracker — Server

Node/Express + MongoDB backend for authentication, transactions, and expense prediction.

## Setup

1) Requirements: Node 18+, MongoDB Atlas (or local), npm.

2) Install deps:
```bash
npm install
```

3) Create `.env` in `smart-expense-tracker-server/`:
```
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
JWT_SECRET=change_me
# Optional AI providers (only used if you opt-in)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

4) Start dev server:
```bash
npm run dev
```
Server will print `Server running on port 5000` when ready.

## Scripts

- `npm run dev` — Start with nodemon
- `npm start` — Start with Node
- `npm run seed:transactions` — Seed demo transactions to the connected DB (check `scripts/seed-transactions.js`)

## Endpoints

- GET `/api/health` → `{ status: 'ok' }`

### Auth
- POST `/api/auth/register`
  - body: `{ name, email, password }`
- POST `/api/auth/login`
  - body: `{ email, password }`
- Both return `{ user, token }` on success.

### Transactions (Protected — Bearer token required)
- GET `/api/transactions`
  - query: `from` (ISO date), `to` (ISO date), `category` (string), pagination via either `page`/`size` or `limit`/`offset`
- POST `/api/transactions`
  - body: `{ amount:number>0, category:string, description?:string, date?:ISO }`
- PUT `/api/transactions/:id`
  - body: any subset of above fields
- DELETE `/api/transactions/:id`

### Prediction (Protected)
- POST `/api/predict`
  - body: `{ days?: number (7..180), useOpenAI?: boolean, useGemini?: boolean }`
  - Default behavior: returns a free heuristic prediction. If `useOpenAI=true` and `OPENAI_API_KEY` is present, calls OpenAI. If `useGemini=true` and `GEMINI_API_KEY` is present, calls Gemini. If multiple are true, Gemini takes precedence in current implementation.

### AI (Protected)
- POST `/api/ai/coach`
  - body: `{ days?: number (7..180), freeOnly?: boolean, provider?: 'heuristic'|'gemini'|'openai'|'auto' }`
  - Returns a coaching suggestion based on recent spend. `freeOnly=true` forces heuristic mode.

- POST `/api/ai/recurring/scan`
  - body: `{ days?: number (30..365), freeOnly?: boolean, provider?: 'heuristic'|'gemini'|'openai'|'auto' }`
  - Scans transactions for likely recurring charges and surfaces insights.

## Request Validation
Lightweight validation without external libraries lives in `validators/schemas.js` and is applied by `middleware/validate.js` in route files. Invalid input returns HTTP 400 with a helpful message.

## Logging
`middleware/requestLogger.js` logs each request as a single JSON line with method, URL, status, and latency. Avoids logging secrets.

## Curl Examples

Register:
```
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"testuser@example.com","password":"Passw0rd!"}'
```

Login:
```
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"Passw0rd!"}'
```

List transactions:
```
curl -X GET 'http://localhost:5000/api/transactions' \
  -H "Authorization: Bearer <JWT>"
```

List transactions (page/size):
```
curl -X GET 'http://localhost:5000/api/transactions?page=2&size=10' \
  -H "Authorization: Bearer <JWT>"
```

List transactions (limit/offset):
```
curl -X GET 'http://localhost:5000/api/transactions?limit=10&offset=20' \
  -H "Authorization: Bearer <JWT>"
```

Create transaction:
```
curl -X POST http://localhost:5000/api/transactions \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"amount":199.99,"category":"shopping","description":"Headphones"}'
```

Predict (heuristic):
```
curl -X POST http://localhost:5000/api/predict \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"days":90}'
```

Predict (OpenAI, optional):
```
curl -X POST http://localhost:5000/api/predict \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"days":90,"useOpenAI":true}'
```

## Postman Collection
Import `docs/SmartExpenseTracker.postman_collection.json`. Run "Auth - Login" to populate `{{token}}` for protected requests.

## Pagination

Transactions support both styles:
- page/size (preferred): `GET /api/transactions?page=1&size=10`
- limit/offset: `GET /api/transactions?limit=10&offset=0`

Response includes metadata:
```
{
  "items": [ /* transactions */ ],
  "meta": {
    "total": 57,
    "limit": 10,
    "offset": 20,
    "page": 3,
    "size": 10,
    "hasMore": true,
    "hasPrevious": true,
    "nextOffset": 30,
    "prevOffset": 10
  }
}
```

## Notes
- Do not commit secrets in `.env`.
- `OPENAI_API_KEY` is optional — the API remains free using the heuristic by default.
