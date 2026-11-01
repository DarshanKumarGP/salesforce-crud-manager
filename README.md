# Salesforce CRUD Manager

Web app that performs Create / Read / Update / Delete on Salesforce standard objects
(**Account, Opportunity, Lead, Contact, Case**) without the Salesforce UI.

- **Auth:** OAuth 2.0 *Authorization Code flow + PKCE* through a Salesforce **External Client App**
- **Backend:** Node.js + Express (tokens stay server-side in the session, never in the browser; expired access tokens are refreshed automatically)
- **Frontend:** plain HTML/CSS/JS (no build step)
- **Pagination:** 20 records per request; the next 20 load when you scroll to the bottom
- **Fields:** 5-10 per object; labels, types, picklist values and required flags come live from the Salesforce `describe` API
- Search box, record count, validation, and Salesforce error messages shown in the UI

## 1. Salesforce setup
1. Sign up: https://developer.salesforce.com/signup and log in to the org.
2. Setup -> search **External Client App Manager** -> **New External Client App**.
   Name e.g. `CRUD Manager`, your contact email, Distribution State = **Local**.
3. Expand **API (Enable OAuth Settings)** -> tick **Enable OAuth**.
   - **Callback URL** (one per line): `http://localhost:3000/oauth/callback` and `https://YOUR-APP.onrender.com/oauth/callback`
   - **OAuth Scopes:** *Manage user data via APIs (api)* and *Perform requests at any time (refresh_token, offline_access)*
   - **Flow Enablement:** tick *Enable Authorization Code and Credentials Flow*
   - **Security:** tick *Require secret for Web Server Flow* and *Require Proof Key for Code Exchange (PKCE)*; leave the JWT-token option unticked
4. Create it, open it -> **Settings** tab -> **OAuth Settings** -> **Consumer Key and Secret** (email verification) and copy both.
5. Wait ~5-10 minutes for the app to propagate before the first login.

## 2. Run locally
```bash
npm install
cp .env.example .env     # fill SF_CLIENT_ID and SF_CLIENT_SECRET
npm start                # http://localhost:3000
```

## 3. Deploy free on Render
1. Push this folder to a **public GitHub repo** (`.env` is git-ignored).
2. render.com -> New -> **Blueprint** (uses `render.yaml`), or New -> Web Service (Build `npm install`, Start `npm start`, Free plan).
3. Environment variables: `SF_CLIENT_ID`, `SF_CLIENT_SECRET` (`NODE_ENV` and `SESSION_SECRET` come from render.yaml).
4. Copy your live URL, add `<URL>/oauth/callback` to the External Client App callback URLs, wait a few minutes.
5. Open the URL -> Login with Salesforce -> test all five objects.

The free tier sleeps after ~15 min idle (first load ~30 s, and you must log in again). Open the link yourself before reviewers do.

## How it works
`/auth/login` creates a PKCE verifier + state and redirects to Salesforce -> user approves -> redirect to `/oauth/callback?code=...` -> server exchanges code (+ verifier + secret) for access/refresh tokens -> stored in a server-side session (httpOnly cookie) -> `/api/*` calls the Salesforce REST API (`/query`, `/sobjects`, `/describe`) with `Authorization: Bearer <token>`; on a 401 the refresh token obtains a new access token.

## Submission
Email careers@cloudvandana.com: subject `Assignment Submission - Associate Software Engineer - <Your Name>`, with the deployed link, GitHub repo link, and your updated resume attached.
