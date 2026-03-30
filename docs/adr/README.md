# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records for the sso-mocker project.

## What Is an ADR?

An ADR captures a significant architectural decision along with its context, reasoning, and consequences. ADRs document the *why* behind decisions rather than the *how* of implementation.

For background, see:
- [AWS Prescriptive Guidance: ADR Process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)
- [Michael Nygard's original ADR proposal](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

## When to Write an ADR

Create an ADR for decisions that affect:
- **Structure** -- service boundaries, module organization, data flow patterns
- **Non-functional requirements** -- security posture, availability, performance constraints
- **Dependencies** -- adding, removing, or replacing libraries and frameworks
- **Interfaces** -- API contracts, protocol choices, integration patterns
- **Construction techniques** -- build tools, testing strategies, deployment methods

If a decision is easily reversible or has negligible impact, it probably does not need an ADR.

## File Naming Convention

```
YYYY-MM-DD-short-description.md
```

Examples:
- `2026-03-30-no-saml-support.md`
- `2026-03-24-use-oidc-provider-v9.md`

The ISO 8601 date prefix ensures chronological ordering. Use the date the ADR was first proposed.

## ADR Template

Each ADR should include these sections:

```markdown
# ADR: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Rejected | Deprecated | Superseded by [ADR-XXXX]

## Context

What is the issue or question being addressed? What forces are at play?

## Decision

What was decided and why?

## Consequences

What are the positive and negative outcomes of this decision?

## Alternatives Considered

What other options were evaluated, and why were they not chosen?
```

## Statuses

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion, not yet approved |
| **Accepted** | Approved by the team and in effect |
| **Rejected** | Evaluated and declined, with reasoning preserved |
| **Deprecated** | No longer relevant due to changed circumstances |
| **Superseded** | Replaced by a newer ADR (link to successor) |

## Index

| Date | Title | Status |
|------|-------|--------|
| 2026-03-30 | [Do not add SAML support](2026-03-30-no-saml-support.md) | Accepted |
