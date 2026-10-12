# STUDMART (white + orange): marketplace, shops, verification, admin

## What's in this ZIP
- `frontend/`: the site
  - `index.html`, `styles.css`, `app.js`: home page, marketplace, accounts, profile
  - `billboard.js`: the slideshow on the home page
  - `post.html`, `post.js`, `post.css`: the page for posting a new listing
  - `shops.html`, `shops.js`, `shops.css`: campus shops directory and each shop's listings
  - `admin.html`, `admin.js`, `admin.css`: admin dashboard (admins only, not indexed by search engines)
- `backend/`: the API (`server.js`, `package.json`). No dependencies, so there is nothing to `npm install`.

## Features
- Personal accounts: sign up, log in, stay logged in across reloads, log out
- Shop accounts: a separate kind of account with a shop name, address (any town or area, not tied to a school), WhatsApp number and description. Shop sign-up does not ask for a school. Sign up from the "Shop account" tab or "Open a shop account" on the home page.
- Profile page (`profile.html`): see your details, verification status and your listings, with Edit, Mark sold and Delete.
- Edit profile page (`edit-profile.html`): change your name, school and bio (personal accounts), or your shop details (shop accounts), and change your password.
- Posting: "Sell an item" opens the post page. Posting only needs you to be logged in.
- Listings: edit, mark sold/available, delete, search and category filters
- Save listings (♡) and view them under "Saved"
- Listing details with a WhatsApp link when the seller adds a number; SHOP badge on shop listings
- Photos are uploaded straight from the phone or computer (JPEG, PNG or WebP, up to 3 MB). Old https photo links still work.
- Billboard slides are edited by admins in the Billboard tab: text, link, colour and an uploaded photo. Save publishes them to the home page.
- Shops page: a directory of shops, and each shop's own listings
- Billboard slideshow on the home page: autoplays, pauses on hover, arrows, dots, swipe on phones
- Student verification: students request a blue tick by sharing a link to their student ID. Admins approve or reject; the student gets an email.
- Admin dashboard (`/admin.html`): verification requests, all users with search and status filter, all listings with remove
- Forgot password: emails a reset link (1 hour, single use) via Resend

## Deploy
1. Push `backend/` and `frontend/` to GitHub.
2. Render redeploys the backend; Vercel redeploys the frontend.

## Render environment variables
| Key | Value |
|---|---|
| `JWT_SECRET` | long random string. Don't change it later, or everyone is logged out. |
| `ALLOWED_ORIGINS` | your Vercel URL, e.g. `https://studmart-x.vercel.app` (no trailing slash) |
| `FRONTEND_URL` | the same Vercel URL. Reset links and admin emails point here. |
| `RESEND_API_KEY` | your Resend API key |
| `EMAIL_FROM` | sender, e.g. `STUDMART <no-reply@yourdomain.com>`. The domain must be verified in Resend. Without it, Resend's test sender is used and only delivers to your own Resend account email. |
| `ADMIN_EMAILS` | comma-separated emails of admin accounts, e.g. `you@school.edu.ng`. Those accounts see the Admin link and can open `/admin.html`. Only admins can approve verification. |
| `NODE_ENV` | `production` |

## Student verification (blue tick)
1. A student opens their profile and pastes an `https://` link to a photo of their student ID (Google Drive, Imgur, etc.) and an optional note.
2. The request appears under "Verification requests" in `/admin.html`.
3. The admin approves or rejects it. The student gets an email either way. Approved accounts get a blue tick on their listings and on the listing details.
4. Admins can also revoke a tick from "All users".

Limits: the tick shows a student ID was checked by a STUDMART admin. It is not a guarantee of identity. Student ID links are personal data. Decide how long to keep them and delete them when no longer needed. The `/admin.html` page is only useful to admins; keep `ADMIN_EMAILS` short.

## Endpoints
Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `firstName, lastName, email, password, school`. Optional `accountType`: `individual` (default) or `shop`. Shops also need `shopName, shopAddress, shopPhone`, optional `shopDescription`. |
| POST | `/api/auth/login` | `email, password` |
| POST | `/api/auth/forgot-password` | `email`. Same reply whether or not the account exists. |
| POST | `/api/auth/reset-password` | `token, password` |
| GET | `/api/auth/me` | Bearer token. Includes `accountType`, `shop`, `isAdmin`, `verification`. |
| PATCH | `/api/auth/profile` | `firstName, lastName, school, bio`. Shop accounts also take `shopName, shopAddress, shopPhone, shopDescription`. Bearer token. |
| POST | `/api/auth/change-password` | `currentPassword, newPassword`. Bearer token. |

Verification
| Method | Path | Notes |
|---|---|---|
| POST | `/api/verification` | Bearer token. `studentIdUrl` (https, max 500 chars), optional `note` (max 300). |

Listings
| Method | Path | Notes |
|---|---|---|
| GET | `/api/listings?category=&q=` | Public. Category: Electronics, Books, Fashion, Hostel. Max 200 results. |
| GET | `/api/listings/:id` | Public |
| POST | `/api/listings` | Bearer token. `title, category, condition, price, pickup, description`, optional `contact, imageUrl` |
| PATCH | `/api/listings/:id` | Owner only. Any of the fields above plus `status` (`active` or `sold`). |
| DELETE | `/api/listings/:id` | Owner only |
| POST | `/api/listings/:id/save` | Bearer token. Toggles and returns `{saved}`. |
| GET | `/api/me/listings` | Bearer token |
| GET | `/api/me/saved` | Bearer token |

Uploads and billboard
| Method | Path | Notes |
|---|---|---|
| POST | `/api/uploads` | Bearer token. `data` = base64 image as `data:image/jpeg;base64,…` (also png, webp). Checks the file's real signature. Returns `{url}` like `/uploads/<id>.jpg`. |
| GET | `/uploads/<file>` | Serves an uploaded photo |
| GET | `/api/billboard` | Public. Returns `{slides}`. Empty list means the home page shows its built-in slides. |
| PUT | `/api/admin/billboard` | Admins only. `slides` (up to 8): `kicker, title, body, buttonText, buttonLink, imageUrl, theme`. Themes: orange, deep, amber, crimson. Links must be `./page.html`, `#section`, `/path`, or `https://`. |

Shops (public)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/shops` | All shops, with active listing counts |
| GET | `/api/shops/:id` | One shop and its listings |

Admin (admins only, from `ADMIN_EMAILS`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users?q=&status=` | `status`: none, pending, approved, rejected |
| POST | `/api/admin/users/:id/verification` | `action`: `approve`, `reject`, or `revoke`. Emails the student on approve or reject. |
| GET | `/api/admin/listings` | All listings |
| DELETE | `/api/admin/listings/:id` | Removes any listing |

Condition values: New, Like new, Good, Fair. Price is whole naira, 0 to 10,000,000. Photo links must start with `https://`.

## Before real launch: read this
- **Photos and billboard images** are saved in an `uploads/` folder next to the database file (`DATA_FILE`). On Render's free disk they are erased on each redeploy, like the data. Move them to cloud storage (for example Cloudinary or S3) together with the database.
- **Data storage.** Users and listings are saved to a JSON file on the server's disk. Render's free disk is erased on each redeploy, so accounts, shops, verification requests and listings would disappear. Move to a real database (Render Postgres is the simplest) before taking real users.
- **Student ID links** are personal data. Set a retention rule and delete links once a request is decided.
- **Messaging.** Buyers contact sellers through the WhatsApp number the seller adds. There is no in-app chat.
- **Images.** Sellers paste a photo link (https). There is no upload yet.
- **Rate limiting.** Login, reset and verification requests aren't rate-limited yet.
- **Google sign-in** still needs Firebase Authentication.
- **Billboard content** is written into `index.html`. Edit the four slides there.

## Local test
```
cd backend
PORT=4000 JWT_SECRET=dev ADMIN_EMAILS=you@school.edu.ng node server.js
curl localhost:4000/api/shops
```

## Troubleshooting
- **Users get logged out after closing the browser.** Check that `JWT_SECRET` is set on Render. Without it, the server makes a new random secret each time it restarts, so every saved login becomes invalid. Free Render services restart after sleeping, so this happens often.
- **Unticked "Remember me"** keeps the session only until the browser tab is closed. This is intentional.
- **The site shows the user as logged in but a short wait follows.** Free hosting can take up to a minute to wake up. The site keeps the saved session and retries; only an expired or invalid login signs the user out.
- **No Admin link appears.** Your account's email must be listed in `ADMIN_EMAILS` on Render, exactly as you signed up with it. Log out and back in after changing it.
