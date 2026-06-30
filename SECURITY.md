# Security

Do not report secrets, API keys, tokens, credentials, or private infrastructure
details in public issues.

If you find a suspected secret exposure or a vulnerability that could affect
provider keys, cloud credentials, or user data, contact the repository owner
privately through GitHub before opening a public report.

## Supported Scope

This is a pet-project prototype. Security fixes are handled on a best-effort
basis for the current `main` branch.

## Secret Handling

- Real `.env` files must stay local.
- Provider keys, AWS credentials, Railway tokens, MCP server tokens, and
  leaderboard signing secrets must be configured through local environment files
  or platform secret stores.
- `.env.example` may contain variable names and placeholders only.
