# ADR 0001: public_html Coexistence

## Status

Accepted

## Decision

Hybrid-Static-CMS keeps an existing `public_html` site as the primary document root. The Bun application owns the control panel, API, and generated `/cms` artifacts without requiring the existing site to move into a CMS-specific rendering model.

## Consequences

- Existing HTML and PHP pages can continue to work.
- Static artifacts reduce runtime coupling for public content.
- Operators must protect the generated namespace and writable paths.
- Reverse proxy configuration and independent backups are part of deployment responsibility.

## Alternatives considered

A full-site replacement CMS would simplify template ownership, but would violate the project requirement to coexist with existing public sites and would increase migration risk for adopters.
