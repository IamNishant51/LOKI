# Security Policy

## Reporting a Vulnerability

Please report security issues directly to the maintainers via email (or github security advisory if enabled).
Do typically NOT open a public issue for sensitive vulnerabilities.

## Local Execution Risks

LOKI executes code (via tools) on your local machine.
- We sandbox tools where possible (read-only git, etc).
- Be careful when adding custom tools that modify the filesystem.
