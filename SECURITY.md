# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of WAMR seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do NOT:

- Open a public GitHub issue for security vulnerabilities
- Discuss the vulnerability in public forums or social media

### Please DO:

1. **Report via GitHub Security Advisories** (Preferred):

   - Go to https://github.com/techieanant/wamr/security/advisories/new
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

2. **Report via Email**:
   - Send an email to: contact@anant.wtf
   - Include "WAMR Security" in the subject line
   - Provide detailed information about the vulnerability

### What to Include in Your Report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)
- Your contact information

### What to Expect:

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Timeline**: Varies based on severity and complexity

We will:

1. Confirm receipt of your report
2. Investigate and validate the vulnerability
3. Develop and test a fix
4. Release a security patch
5. Publicly acknowledge your responsible disclosure (unless you prefer to remain anonymous)

## Security Best Practices for Users

### Environment Variables

- **Never commit `.env` files** to version control
- **Use strong, unique passwords** for admin accounts
- **Generate secure keys**:

  ```bash
  # JWT Secret (64 hex characters)
  openssl rand -hex 32

  # Encryption Key (64 hex characters)
  openssl rand -hex 32
  ```

### Docker Deployment

- **Change default passwords** immediately after first login
- **Keep containers updated** with latest security patches
- **Use Docker secrets** for production environments
- **Restrict network access** using firewalls
- **Enable HTTPS** with reverse proxy (nginx, Traefik, Caddy)

### Database Security

- **Backup regularly** and store backups securely
- **Encrypt sensitive data** at rest
- **Limit database access** to application only
- **Use volume encryption** for Docker volumes

### WhatsApp Session

- **Protect session files** (.wwebjs_auth directory)
- **Limit access** to WhatsApp-connected phone
- **Monitor for unauthorized access**
- **Revoke sessions** if compromised

### API Keys

- **Store securely** using encryption
- **Rotate regularly** (every 90 days recommended)
- **Use read-only keys** when possible
- **Monitor API usage** for anomalies

### Network Security

- **Use HTTPS** for all external connections
- **Configure CORS** properly (don't use wildcards in production)
- **Enable rate limiting** to prevent abuse
- **Use strong TLS** versions (1.2+)

### Access Control

- **Use strong passwords** (minimum 6 characters, recommended 12+)
- **Enable 2FA** when available
- **Limit admin access** to necessary personnel only
- **Review audit logs** regularly

## Security Features

WAMR includes several built-in security features:

- **Password Hashing**: Argon2id for secure password storage
- **JWT Authentication**: Secure session management
- **API Key Encryption**: AES-256-GCM for service credentials
- **Rate Limiting**: Protection against brute force attacks
- **CORS Protection**: Configurable origin restrictions
- **Input Validation**: Zod schemas for all API inputs
- **SQL Injection Prevention**: Parameterized queries with Drizzle ORM
- **Audit Logging**: Complete request history tracking

## Known Security Considerations

### WhatsApp Web API

- WAMR uses [Baileys](https://github.com/whiskeysockets/baileys) which is an unofficial WhatsApp Web API
- WhatsApp may ban accounts that violate their Terms of Service
- Use a dedicated WhatsApp Business account
- Monitor for suspicious activity

### Self-Hosted Risks

- You are responsible for securing your own deployment
- Keep Node.js and dependencies updated
- Follow security best practices for your hosting environment
- Regularly backup data

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine affected versions
2. Audit code to find similar problems
3. Prepare fixes for all supported versions
4. Release patches as quickly as possible

## Hall of Fame

We appreciate security researchers who responsibly disclose vulnerabilities. Contributors will be listed here (with permission):

<!-- Security researchers will be added here -->

## Questions?

If you have questions about this security policy, please email contact@anant.wtf.

---

**Last Updated**: October 2025
