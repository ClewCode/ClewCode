# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.1.x   | Yes       |
| < 2.1   | No        |

## Reporting a Vulnerability

We take the security of Claude Code seriously. If you discover a security vulnerability, please follow these steps:

### Do Not

- Open a public GitHub issue for security vulnerabilities
- Share the vulnerability publicly before it has been addressed
- Exploit the vulnerability beyond what is necessary to confirm its existence

### Do

1. **Email us directly** at a security contact (or use GitHub's private vulnerability reporting if available)
2. **Include the following information**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Suggested fix (if you have one)
3. **Allow reasonable time** for us to respond and address the issue before any public disclosure

## What We Consider a Security Vulnerability

- API key or credential exposure
- Remote code execution vulnerabilities
- Path traversal or file access bypasses
- Authentication or authorization bypasses
- Data leakage or privacy violations
- Dependency vulnerabilities with direct impact

## What Is Not a Security Vulnerability

- Bugs that do not impact security or privacy
- Issues already reported or known
- Problems in unsupported versions
- Social engineering attacks requiring user interaction beyond the tool's scope

## Response Timeline

We aim to:

- **Acknowledge receipt** within 48 hours
- **Provide an initial assessment** within 7 days
- **Release a fix** within 30 days for critical vulnerabilities
- **Publish a security advisory** after the fix is released

## Security Best Practices for Users

- Never commit API keys or credentials to the repository
- Use environment variables or secure key management for API keys
- Keep your installation up to date
- Review tool execution permissions before granting access
- Do not run Claude Code with elevated privileges unless necessary
- Regularly audit installed plugins for trustworthiness

## Dependency Security

We monitor dependencies for known vulnerabilities. If you notice an outdated or vulnerable dependency, please report it through the channels above.
