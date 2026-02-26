# Security Guide

## Authentication Architecture

LoadTracker Pro uses **JWT-based authentication** backed by Railway PostgreSQL.
Supabase authentication has been fully removed.

### Authentication Flow

1. **Signup** – POST `/api/auth/signup` with `{ email, password, name, role }`
   - Password is hashed with **bcrypt** (cost factor 12) before storage
   - Returns a signed **JWT** valid for 7 days

2. **Login** – POST `/api/auth/login` with `{ email, password }`
   - Verifies the password against the stored bcrypt hash
   - Returns a signed **JWT** valid for 7 days

3. **Authenticated Requests** – include the JWT in the `Authorization` header:
   ```
   Authorization: Bearer <token>
   ```

4. **Logout** – clear the JWT from `localStorage` on the client (`tms_token` key)

### Password Security

- Passwords are hashed with **bcrypt** (cost 12) – never stored in plaintext
- Use `scripts/hash-passwords.js` to migrate any legacy plaintext passwords:
  ```bash
  DATABASE_URL=<your-url> node scripts/hash-passwords.js
  ```

### JWT Secret

- Set `JWT_SECRET` as an environment variable on Railway and locally in `.env`
- Generate a strong secret:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Never commit the secret to version control**
- Rotate the secret periodically; all existing tokens will be invalidated on rotation

## Protected API Endpoints

All data-access endpoints require a valid JWT:

| Endpoint | Method | Auth Required |
|---|---|---|
| `/api/health` | GET | No |
| `/api/auth/login` | POST | No |
| `/api/auth/signup` | POST | No |
| `/api/query` | POST | **Yes** |
| `/api/geocode` | POST | No |
| `/api/geocode-and-save` | POST | **Yes** |
| `/api/reverse-geocode` | POST | No |
| `/api/calculate-route` | POST | No |
| `/api/here-config` | GET | No |
| `/api/send-invoice-email` | POST | **Yes** |

## Security Checklist

- [x] Passwords hashed with bcrypt (cost 12)
- [x] JWT-based authentication implemented
- [x] JWT middleware protecting sensitive endpoints
- [x] Supabase authentication fully removed
- [x] No plaintext passwords stored
- [x] Password migration script provided
- [x] Rate limiting enabled (100 req / 15 min per IP)
- [ ] Replace generic `/api/query` with specific typed endpoints
- [ ] Enable proper SSL certificate verification for database connections
- [ ] Implement token refresh / revocation
- [ ] Implement file upload functionality with virus scanning
- [ ] Set up monitoring and alerting for suspicious activity
- [ ] Regular security audits
- [ ] Keep dependencies up to date

## Remaining Known Limitations

### Generic `/api/query` Endpoint

The `/api/query` endpoint still accepts arbitrary parameterized SQL from the
frontend. While it is now protected by JWT authentication, it is still a broad
surface area. Replace it with specific REST endpoints per operation as time
allows.

### SSL Certificate Validation

SSL certificate validation is disabled for Railway database connections:
```javascript
ssl: { rejectUnauthorized: false }
```
This is acceptable within Railway's internal network but should be reviewed
if the database is exposed externally.

### Real-time Subscriptions / File Storage

These Supabase features were stubbed out during migration and will silently
fail. Implement replacements (e.g. WebSockets for real-time, S3/Cloudflare R2
for storage) as needed.

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

## Reporting Security Issues

If you discover a security vulnerability, please email security@example.com
instead of using the public issue tracker.
