# Baseline: share-link

Written by `tools/record_capability.mjs`. The page mints a capability, opens it as the recipient
from the fragment, and then widens the scope in the address bar.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| token | 358 characters |
| scope | read:own, write:own |
| recipient verdict | allowed |
| forged verdict | refused (signature: does not match the payload) |
| verify | 2.68 ms |

## What the record says

A permission that lives in the link verifies in the page, with the issuer's public key travelling
inside the token and no request to a server. The forgery changes the scope in the address bar and
the signature refuses it, because the signature covers the canonical payload.

## What it does not say

It does not say the link can be revoked. A capability in a fragment is a bearer token: whoever has
the link has the permission until it expires, and revocation is the chapter's honest hole.
