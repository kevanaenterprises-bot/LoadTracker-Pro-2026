# Security Considerations

## ⚠️ Critical Security Issues

This application was migrated from Supabase to direct PostgreSQL. The migration preserves the original security model, which has several limitations that **MUST** be addressed before production deployment.

### 1. Plaintext Password Storage

**Issue**: Passwords are stored in plaintext in the `password_hash` column (despite the misleading name).

**Risk**: If the database is compromised, all user passwords are immediately exposed.

**Fix Required**:
```javascript
// Install bcrypt
npm install bcrypt

// In AuthContext.tsx - Update login
import bcrypt from 'bcrypt';

// When creating a user
const hashedPassword = await bcrypt.hash(password, 10);

// When logging in
const isValid = await bcrypt.compare(password, storedHash);
```

**Migration Steps**:
1. Add a migration script to hash existing passwords
2. Update the login function in `src/contexts/AuthContext.tsx`
3. Update any user creation code to hash passwords
4. Update the database schema migration to reflect proper password hashing

### 2. Unauthenticated API Endpoint

**Issue**: The `/api/query` endpoint accepts arbitrary SQL queries without authentication.

**Risk**: Anyone can execute SELECT, INSERT, UPDATE, DELETE queries against your database.

**Current Protections** (inadequate):
- Blocks certain dangerous keywords (DROP, TRUNCATE, etc.)
- Prevents multiple statements
- Uses parameterized queries (prevents basic SQL injection)

**Fix Required**:
Replace the generic query endpoint with specific authenticated endpoints:

```javascript
// Example of a properly secured endpoint
app.get('/api/customers', authenticateToken, async (req, res) => {
  // Verify user has permission to view customers
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const result = await pool.query('SELECT * FROM customers ORDER BY company_name');
  res.json(result.rows);
});
```

### 3. Missing Features

The following Supabase features are not yet implemented and will cause runtime errors:

#### Realtime Subscriptions
- **Used in**: `NotificationBell.tsx`
- **Current Status**: Returns stub methods that do nothing
- **Impact**: Real-time notifications won't work

#### Edge Functions
- **Used in**: Multiple files for:
  - File uploads (`upload-pod-file`)
  - Webhooks (`here-webhook`)
  - SMS sending (`send-driver-sms`)
  - Email sending (`send-invoice-email`)
  - AI features (`ai-dispatch-advisor`)
- **Current Status**: Returns stub that logs warning
- **Impact**: These features will silently fail

#### File Storage
- **Used in**: Driver files, POD documents
- **Current Status**: Returns stub that logs warning
- **Impact**: File uploads won't work

### 4. SSL Certificate Validation Disabled

**Issue**: SSL certificate validation is disabled for Railway connections:
```javascript
ssl: { rejectUnauthorized: false }
```

**Risk**: Vulnerable to man-in-the-middle attacks

**Fix**: Use proper SSL certificate validation or ensure Railway's SSL certificates are trusted by Node.js

## Security Checklist for Production

- [ ] Implement password hashing (bcrypt/Argon2/PBKDF2)
- [ ] Migrate existing passwords to hashed format
- [ ] Replace `/api/query` with specific authenticated endpoints
- [ ] Implement JWT or session-based authentication
- [ ] Add authorization checks to all API endpoints
- [ ] Enable SSL certificate validation
- [ ] Implement rate limiting
- [ ] Add request validation and sanitization
- [ ] Set up CORS properly (restrict allowed origins)
- [ ] Implement file upload functionality with virus scanning
- [ ] Set up monitoring and alerting for suspicious activity
- [ ] Regular security audits
- [ ] Keep dependencies up to date

## Recommended Authentication Flow

1. **Login**:
   - Client sends email/password to `/api/auth/login`
   - Server verifies credentials using bcrypt
   - Server generates JWT token
   - Client stores token in httpOnly cookie or localStorage

2. **Authenticated Requests**:
   - Client includes JWT token in Authorization header
   - Server middleware verifies token
   - Server checks user permissions
   - Server executes request if authorized

3. **Logout**:
   - Clear token from client
   - Optionally maintain token blacklist on server

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

## Reporting Security Issues

If you discover a security vulnerability, please email security@example.com instead of using the public issue tracker.
