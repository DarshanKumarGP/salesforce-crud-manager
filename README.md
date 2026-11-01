# Salesforce CRUD Manager

A web application that performs Create, Read, Update and Delete operations on Salesforce standard objects (**Account, Opportunity, Lead, Contact and Case**) without using the native Salesforce interface. Users sign in with Salesforce through OAuth 2.0, pick an object from a dropdown, and manage its records directly in the app.

## Features

- **OAuth 2.0 login** using the Authorization Code flow with PKCE through a Salesforce External Client App
- **Object dropdown** for Account, Opportunity, Lead, Contact and Case
- **Dynamic fields:** 7 to 8 fields per object (within the 5 to 10 range). Labels, data types, picklist values and required flags are read live from the Salesforce `describe` API
- **Infinite scroll:** 20 records per request, and the next 20 load automatically when the user scrolls to the end of the table
- **Full CRUD:** view, create, edit and delete records, with a confirmation step before deleting
- **Search** across the main text fields of each object, plus a live record count
- **Validation and error handling:** required fields are enforced in the form and on the server, and Salesforce error messages are shown in the UI
- Session expiry handling with automatic access-token refresh

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js (18+), Express |
| Frontend | HTML, CSS and vanilla JavaScript (no build step) |
| Auth | OAuth 2.0 Authorization Code flow with PKCE |
| Salesforce API | REST API v62.0 (`/query`, `/sobjects`, `/describe`) |
| Hosting | Render (free tier) |

## How It Works

1. The user clicks **Login with Salesforce**. The server generates a PKCE code verifier and a state value, stores them in the session, and redirects to Salesforce.
2. The user approves access. Salesforce redirects back to `/oauth/callback` with an authorization code.
3. The server validates the state and exchanges the code (plus the verifier and client secret) for an access token and a refresh token.
4. Tokens are stored in a server-side session behind an `httpOnly` cookie, so they are never exposed to browser JavaScript.
5. Every `/api/*` request is proxied to the Salesforce REST API with `Authorization: Bearer <access token>`. If Salesforce returns 401, the server uses the refresh token to get a new access token and retries once.

**Pagination:** records are fetched with keyset pagination ordered by `Id` descending (newest first). The server requests 21 rows, returns 20, and uses the 21st row to decide whether more exist. This avoids the 2,000-row limit of SOQL `OFFSET`.

**Security:** PKCE and state validation, a new session id after login, `httpOnly` and `SameSite` cookies, a custom-header CSRF check on state-changing requests, input validation and field whitelisting on every write, SOQL string escaping, object-name and record-id validation, and Helmet security headers.

## Project Structure

```
.
├── server.js            # Express app, OAuth routes, session and security setup
├── src/
│   ├── api.js           # CRUD REST endpoints
│   ├── sf.js            # Salesforce client, token refresh, describe metadata
│   └── objects.js       # Objects and fields shown for each object
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js           # UI, infinite scroll, forms and modals
├── render.yaml          # Render deployment blueprint
├── .env.example         # Environment variable template
└── package.json
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/auth/login` | Starts the OAuth flow |
| GET | `/oauth/callback` | Completes the OAuth flow |
| GET | `/auth/me` | Returns the current session user |
| POST | `/auth/logout` | Revokes the token and ends the session |
| GET | `/api/objects` | Lists supported objects |
| GET | `/api/objects/:object/meta` | Field metadata for an object |
| GET | `/api/objects/:object/records?cursor=&search=` | Returns 20 records per page |
| GET | `/api/objects/:object/records/:id` | Returns a single record |
| POST | `/api/objects/:object/records` | Creates a record |
| PATCH | `/api/objects/:object/records/:id` | Updates a record |
| DELETE | `/api/objects/:object/records/:id` | Deletes a record |

## Setup

### 1. Salesforce Developer Org and External Client App

1. Create a free org at [developer.salesforce.com/signup](https://developer.salesforce.com/signup).
2. In **Setup**, open **External Client App Manager** and click **New External Client App**. Enter a name, a contact email, and set **Distribution State** to **Local**.
3. Under **API (Enable OAuth Settings)**, tick **Enable OAuth** and configure:
   - **Callback URLs** (one per line): `http://localhost:3000/oauth/callback`, plus your deployed URL followed by `/oauth/callback`
   - **OAuth Scopes:** *Manage user data via APIs (api)* and *Perform requests at any time (refresh_token, offline_access)*
   - **Flow Enablement:** *Enable Authorization Code and Credentials Flow*
   - **Security:** *Require secret for Web Server Flow* and *Require Proof Key for Code Exchange (PKCE)*
4. Save, then open the app's **Settings** tab, expand **OAuth Settings** and click **Consumer Key and Secret** to copy both values.
5. In the app's **Policies** tab, set **Permitted Users** to *All users may self-authorize* if login reports that the app is not approved.

New apps can take up to 10 minutes to become active.

### 2. Environment Variables

Copy `.env.example` to `.env` and set:

| Variable | Description |
|---|---|
| `SF_CLIENT_ID` | Consumer Key of the External Client App |
| `SF_CLIENT_SECRET` | Consumer Secret of the External Client App |
| `SF_LOGIN_URL` | Your org's My Domain URL (for example `https://yourdomain.develop.my.salesforce.com`), or `https://login.salesforce.com` |
| `BASE_URL` | Public URL of this app, `http://localhost:3000` locally. On Render it is detected automatically |
| `SESSION_SECRET` | A long random string used to sign session cookies |
| `PORT` | Server port (default `3000`) |
| `SF_API_VERSION` | Optional. Salesforce API version (default `62.0`) |

### 3. Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000` and click **Login with Salesforce**.

### 4. Deploy to Render

1. Push the repository to GitHub.
2. On [render.com](https://render.com), create a **Web Service** from the repository (Build command `npm install`, Start command `npm start`, Free instance type). Alternatively, use **New > Blueprint** to deploy from `render.yaml`.
3. Add the environment variables `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_LOGIN_URL`, `NODE_ENV=production` and `SESSION_SECRET`.
4. Add the Render service URL followed by `/oauth/callback` to the External Client App's callback URLs in Salesforce.

## Notes

- Render's free tier puts the service to sleep after about 15 minutes of inactivity, so the first request may take around 30 seconds. Sessions are held in memory and reset after a restart, so users log in again.
- The app only works with data the signed-in Salesforce user is allowed to access. Field visibility and create, edit and delete permissions come from that user's profile.
- Records are always shown newest first.