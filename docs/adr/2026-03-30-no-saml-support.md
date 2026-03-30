# ADR: Do Not Add SAML Support

**Date:** 2026-03-30
**Status:** Accepted

## Context

SSO Mocker is named "SSO Mocker," and SSO in the enterprise world encompasses both OIDC and SAML. This raises the question: should the project support SAML in addition to OIDC?

The project is currently a pure OIDC/OAuth 2.0 identity provider built on `oidc-provider` v9 (OpenID Certified). A codebase review confirmed there is **zero SAML capability** anywhere in the project:

- `oidc-provider` has no SAML support — a search of its entire source tree returns zero matches for "SAML"
- All endpoints are OIDC/OAuth 2.0: discovery (JSON), authorize, token, userinfo, JWKS, introspection, revocation
- Signing uses JWK/JWT (RS256 via `jose`), not X.509/XMLDSig
- No XML processing exists anywhere in the source — no XML parsers, builders, or crypto libraries
- No SAML libraries appear in `package.json` or `package-lock.json`
- SAML is explicitly listed as out of scope in both [`docs/VISION.md`](../VISION.md) (line 49) and the [Design Spec](../superpowers/specs/2026-03-24-sso-mocker-design.md) (line 22)

Some enterprises still rely on SAML for legacy integrations (older Salesforce, ADFS-dependent apps, custom SP implementations). The question is whether the value of covering those use cases outweighs the cost.

## Decision

**Do not add SAML support to SSO Mocker.**

The project's value comes from doing OIDC exceptionally well with a certified library, minimal dependencies, and structural safety guarantees. SAML would dilute that focus for a diminishing use case. Teams needing SAML testing should use a dedicated SAML mock alongside SSO Mocker.

### Rationale

**1. Disproportionate cost for a shrinking protocol.**
SAML 2.0 was published in 2005. The industry trend is firmly toward OIDC — Okta, Auth0, and Azure AD all recommend OIDC for new integrations. Adding SAML would require an estimated 1,200-1,700 new lines of code (50-70% codebase increase) to serve a use case that is actively declining.

**2. Entirely different security surface.**
OIDC uses JSON/JWT — compact, well-understood, simple to validate. SAML uses XML with XMLDSig, which has a long history of vulnerabilities:
- XML Signature Wrapping (XSW) attacks
- XXE (XML External Entity) injection
- Canonicalization bugs (C14N is notoriously error-prone)
- Comment injection in NameID values

**3. No certified SAML library for Node.js.**
`oidc-provider` is OpenID Certified — SSO Mocker inherits that assurance for free. The most capable Node.js SAML library (`samlify`) is community-maintained with no equivalent certification and periodic maintenance gaps.

**4. Heavy dependency tree.**
The current OIDC stack adds essentially just `jose` (zero transitive dependencies). SAML would require `samlify`, `@xmldom/xmldom`, `xml-crypto`, `node-rsa`, `xpath`, and `@authenio/xml-encryption` — a much larger attack surface and supply chain risk.

**5. Violates project principles.**
The [Vision](../VISION.md) principles emphasize certified implementations, structural safety, and minimal complexity. [AGENTS.md](../../AGENTS.md) explicitly prohibits supplementing with other identity libraries. Adding SAML would require a deliberate scope expansion against these principles.

**6. Double maintenance burden.**
Two protocol stacks means two sets of security advisories, two configuration surfaces, two test suites, and twice the documentation — significant for a small open-source project.

## Consequences

### Positive

- Project stays focused on OIDC with a certified, well-tested foundation
- Dependency tree remains minimal and auditable
- No XML security surface to monitor or patch
- Codebase stays small (~2,400 lines) and easy to contribute to
- Clear scope makes the project easier to evaluate and adopt

### Negative

- Teams with SAML-only legacy services cannot use SSO Mocker for those integrations
- The "SSO" in the name may set expectations the project does not meet
- Organizations running mixed OIDC/SAML environments need two tools instead of one

## Alternatives Considered

### A. Use a Dedicated SAML Mock Alongside SSO Mocker (Recommended)

Run SSO Mocker for OIDC and a separate SAML mock (e.g., `mock-saml-idp` or a containerized Keycloak with SAML enabled) for SAML testing.

**Pros:** Zero changes to SSO Mocker; each tool does one thing well.
**Cons:** Two tools to configure and run in CI.

### B. SAML-to-OIDC Bridge Proxy

Build a thin SAML facade (~800-1,200 lines) as a **separate companion package** that accepts SAML `<AuthnRequest>` messages, internally drives an OIDC flow against SSO Mocker, and returns a SAML `<Response>` to the SP.

**Pros:** Reuses all existing identity logic; SAML is a protocol translation layer.
**Cons:** Non-standard hybrid; may not pass strict SAML conformance testing; still requires XML crypto dependencies. Better suited as a separate repo if demand materializes.

### C. Full SAML IdP Implementation

Add a `src/saml/` module using `samlify` with X.509 cert management, SAML metadata endpoint, SSO/SLO endpoints, SP registration in the Admin API, and HTTP-POST/Redirect bindings.

**Estimated effort:**

| Component | Lines |
|-----------|-------|
| SAML config schema (Zod) | 100-150 |
| Certificate management | 80-120 |
| IdP metadata endpoint | 30-50 |
| SSO endpoint | 150-250 |
| SLO endpoint | 80-120 |
| Attribute mapper | 60-80 |
| SP registration (Admin API) | 150-200 |
| Login UI integration | 80-100 |
| Config YAML | 40-60 |
| Tests | 400-600 |
| **Total** | **~1,200-1,700** |

**New dependencies:** `samlify`, `@xmldom/xmldom`, `xml-crypto`, `node-rsa`, `xpath`, `@authenio/xml-encryption`

**Rejected** due to the cost, security surface, and maintenance burden outlined above.

### D. Recommend OIDC Migration

Advise teams with legacy SAML integrations to migrate those Service Providers to OIDC.

**Pros:** Eliminates the need for SAML testing entirely.
**Cons:** Not always feasible for third-party or vendor-controlled SPs.
