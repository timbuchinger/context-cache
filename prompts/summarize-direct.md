Please write a concise, factual summary of this conversation. Output ONLY the summary wrapped in `<summary></summary>` tags — no preamble, no apologies, no meta-commentary.

Focus on:
- What was built, changed, or decided
- Key technical decisions and approaches used
- Problems encountered and how they were solved

Maximum 200 words. Be specific — focus on what makes this conversation unique, not generic descriptions.

Good example:
<summary>Implemented JWT authentication for an Express API with refresh token rotation. Resolved an invalid signature error caused by dotenv loading after router registration. Decided to use opaque random tokens (not JWTs) for refresh tokens, stored hashed in the database. Added Axios interceptor on the frontend to transparently retry requests after token refresh.</summary>

Bad example:
<summary>This conversation discussed authentication and various approaches were considered across multiple topics.</summary>

{{conversation}}
