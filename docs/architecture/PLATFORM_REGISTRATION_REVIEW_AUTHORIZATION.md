# Platform registration review — authorization boundary

Status: design for implementation on the Finance feature branch
Scope: ZENOX Finance only. Never apply this design to ZENOX FRET V2.

## Security decisions

1. Platform reviewers are not ordinary tenant members. Their authority is stored in a dedicated server-side table keyed by the verified identity-provider issuer + subject.
2. No user metadata, e-mail suffix, tenant role, or browser-supplied role is trusted as platform authorization.
3. No public endpoint can create or promote a platform operator. The first operator must be bootstrapped by an authorized database administrator in the dedicated Finance database after verifying the Supabase Auth subject. The bootstrap is manual and audited; there is no default operator, shared password, or production seed identity.
4. Both the HTTP route and the database SECURITY DEFINER function verify that the operator is active. The database function independently checks the operator row so possession of a normal user session is insufficient.
5. Platform operator access requires a verified Supabase session and confirmed e-mail. Browser requests use the existing same-origin and HttpOnly session-cookie boundary. No service-role key or database credential is exposed to the browser.
6. A platform operator cannot review their own organization request.
7. Review is atomic and terminal:
   - APPROVE: request -> APPROVED; tenant -> ACTIVE; requester OWNER membership -> ACTIVE with activated_at.
   - REJECT: request -> REJECTED with a required reason; tenant -> DISABLED; requester membership -> REVOKED.
   - A request not in PENDING cannot be reviewed again.
8. Every decision writes a tenant-scoped audit event in the same transaction. Audit metadata contains the decision, not the rejection prose.
9. Request owners can read only their own status/rejection reason. Platform operators can list only pending requests and review them. Direct browser table access remains revoked and RLS remains enabled + forced.
10. The first platform operator is created through a controlled DBA runbook. The runbook must never contain a real user UUID, credential, or secret committed to Git.

## API contract

- GET /api/v1/user/platform/me — return operator status only for the verified current identity.
- GET /api/v1/user/platform/registration-requests — list pending requests for an active operator.
- POST /api/v1/user/platform/registration-requests/:requestId/decision — strict body { decision: APPROVE } or { decision: REJECT, reason: string }.
- All mutations require same-origin Origin, confirmed e-mail, a valid request UUID, strict body validation, active operator authorization, and audit correlation ID.
- Unauthorized identities receive 403 without registration data leakage.

## Bootstrap runbook

The production operator cannot be guessed or selected by e-mail alone. After the operator has signed up and confirmed their e-mail in the dedicated Finance Supabase project, an authorized DBA verifies the Auth subject and inserts exactly that issuer/subject into finance_platform_operators using a privileged session. This operation must be recorded in the operational change log. Never run bootstrap SQL against zenoxfret_v2.

## Explicit exclusions

- No self-service operator promotion.
- No operator-management UI or role changes in this phase.
- No automatic activation merely because an e-mail is confirmed.
- No direct mutation of tenant or membership tables by the browser.
- Legal terms and privacy text remain draft until reviewed and approved.
