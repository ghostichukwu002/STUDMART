# STUDMART backend

A small dependency-free Node.js REST API for the STUDMART frontend prototype. It uses a JSON file for persistence so it can run immediately without a database service or package installation.

## Run

```bash
cd backend
npm start
```

The server hosts both the API and the frontend at `http://localhost:8787`.

- Frontend: `http://localhost:8787/`
- Health check: `http://localhost:8787/api/health`

Set `PORT` to use a different port:

```bash
PORT=3000 npm start
```

Create an account from the STUDMART profile screen. New registrations require a password with at least 8 characters.

## School email verification

Email-code verification uses Resend. Configure `RESEND_API_KEY`, `STUDMART_FROM_EMAIL`, and a long random `STUDMART_VERIFICATION_SECRET` in the backend `.env` file (and in the production host's environment). Add approved email domains to `school-email-domains.json`, keyed by the exact school name returned by `/api/schools`, for example `{ "University of Example": ["students.example.edu.ng"] }`. Keep this list limited to domains the school actually provides to students. Empty or unlisted schools can still use StudMart while unverified.

Users select their school and state on the profile, save them, enter a school-issued email address, request a six-digit email code, and enter it there. The login email remains unchanged. Codes expire after 10 minutes, can be requested once per minute, and allow five attempts. Verification confirms access to the approved email domain.

## API routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create an account and return a token |
| POST | `/api/auth/login` | Log in and return a token |
| POST | `/api/auth/logout` | Revoke the current session; requires Bearer token |
| POST | `/api/verification/email/start` | Email a school verification code; requires Bearer token |
| POST | `/api/verification/email/confirm` | Confirm the code; requires Bearer token |
| POST | `/api/uploads` | Upload one JPG, PNG, or WebP image to Cloudinary; requires Bearer token |
| GET | `/api/me` | Get the current authenticated user |
| GET | `/api/health` | Check API availability |
| GET | `/api/states` | List Nigerian states represented by schools |
| GET | `/api/schools?state=Lagos&search=university` | Search schools |
| GET | `/api/listings` | List listings; supports `category`, `search`, `school`, `state`, and `sort` |
| GET | `/api/listings/:id` | Read one listing |
| POST | `/api/listings` | Create a listing; requires Bearer token |
| PATCH | `/api/listings/:id` | Edit your listing; requires Bearer token |
| GET | `/api/saved` | Read your saved listings; requires Bearer token |
| POST | `/api/saved/:listingId` | Save a listing; requires Bearer token |
| DELETE | `/api/saved/:listingId` | Remove a saved listing; requires Bearer token |
| GET | `/api/users/:id` | Read a public user profile |
| PATCH | `/api/profile` | Update your profile; requires Bearer token |
| GET | `/api/conversations` | List your conversations; requires Bearer token |
| GET | `/api/conversations/:id` | Read conversation messages; requires Bearer token |
| POST | `/api/conversations/:id` | Send a message; requires Bearer token |
| POST | `/api/conversations` | Start or reuse a conversation for a listing; requires Bearer token |

## Notes

- `db.json` is intentionally simple and is suitable for this prototype, local demos, and early integration.
- New account passwords are stored using Node.js `scrypt`; the seeded demo-only account cannot log in.
- Product images are stored in Cloudinary; local credentials belong in `STUDMART_backend/.env` (copy `.env.example` and fill in the values). The `.env` file is ignored by Git.
- Set Cloudinary and Resend credentials as environment variables on the production host; never commit `.env` or secrets.
- For production, replace `db.json` with a managed database, add broader rate limiting, password reset, stronger input validation, and a production-grade session strategy.
- The frontend marketplace, school filters, signup/login/logout, saved listings, listing creation, product images, listing conversations, and school email verification use the API. Chat refreshes messages every five seconds.
