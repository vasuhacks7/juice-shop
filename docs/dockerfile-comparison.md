# Dockerfile Hardening — Before / After Comparison

## Important context first

The challenge brief describes the current-state container setup as "generic
base images, no hardening." I inspected Juice Shop's actual, existing
`Dockerfile` rather than assuming this was true, and found the maintainers
already implement several strong practices:

| Practice | Already in place? |
|---|---|
| Multi-stage build (build tools discarded from final image) | ✅ Yes |
| Minimal/distroless final base image | ✅ Yes (`gcr.io/distroless/nodejs24-debian13`) |
| Non-root user | ✅ Yes (`USER 65532`) |
| `.dockerignore` excluding `.git`, `node_modules`, tests | ✅ Yes |

So this is **not** a "generic base image with no hardening → hardened"
transformation — it's an incremental hardening pass on an already-solid
foundation, closing the specific gaps that remained.

## What changed, and why

| Gap found | Risk | Fix applied |
|---|---|---|
| No explicit guard against `.env` files entering the build context | `.dockerignore` silently *skips* matching files — it doesn't fail the build if a developer's local `.env` somehow isn't excluded (e.g. a rename, a typo in `.dockerignore`, a CI checkout quirk). Given this exact scenario's risk brief flags `.env` files being committed as Critical, a silent skip isn't defense in depth, it's a single point of failure | Added an explicit `RUN` check early in the build stage that fails loudly (`exit 1`) if `.env` is present in the build context, rather than relying solely on `.dockerignore` |
| No documented rationale for missing `HEALTHCHECK` | Could look like an oversight during review | Documented explicitly: distroless has no shell, so a traditional `HEALTHCHECK CMD curl ...` cannot execute inside this image. Health checking should happen at the orchestrator level (e.g. Kubernetes `livenessProbe` doing an HTTP GET from outside the container) instead of inside the Dockerfile. Adding a shell just to support `HEALTHCHECK` would reintroduce the exact attack surface distroless is designed to remove. |

## Follow-up improvement, not yet applied (documented honestly rather than faked)

**Pin both `FROM` stages to an immutable digest, not just a mutable tag** (`node:24`, `gcr.io/distroless/nodejs24-debian13`). Right now, an upstream republish of either tag could silently change what a future build pulls in — a supply-chain integrity gap, not a hypothetical one (this exact pattern has been used in real registry-poisoning incidents). This wasn't applied here because resolving current digests requires a local `docker pull` + `docker inspect` step, and this Dockerfile was built and validated entirely inside CI without a local Docker environment. With more time, I'd resolve and pin both digests, then add a scheduled job to re-verify/re-pin periodically as base images patch.

## What I deliberately did NOT change, and why

- **Did not switch away from distroless to a shell-having minimal image** (like `node:24-alpine`) for the sake of adding a traditional `HEALTHCHECK` — that would be trading a real security property (no shell = no post-exploitation tooling available to an attacker) for a minor operational convenience. Wrong trade for a fintech threat model.
- **Did not change the non-root UID** (`65532`) — this is the standard "nonroot" convention used across Google's distroless images and is already correct.

## Expected scan outcome — and why "hardened" doesn't mean "zero findings"

Hardening (distroless, non-root, no shell) reduces **OS-layer attack surface**
— expect the OS-level Trivy findings to drop substantially compared to the
original `node:24`-based image, since distroless strips out almost all
bundled system packages. It does **not** patch **application-level**
vulnerabilities already present in `node_modules` (the same CVEs `npm audit`
already found — `ws`, `node-tar`, `uuid`, etc.) — those require dependency
updates, a separate remediation path from container hardening. The
container scan gate will likely still fail on Critical/High findings even
against the hardened image, and that's expected, not a bug: it's a second,
independent confirmation of the same underlying dependency risk the SCA gate
already flagged, at the container-image layer instead of the manifest layer.

## How to resolve and apply digest pins yourself, if continuing this work

```bash
docker pull node:24
docker inspect --format='{{index .RepoDigests 0}}' node:24

docker pull gcr.io/distroless/nodejs24-debian13
docker inspect --format='{{index .RepoDigests 0}}' gcr.io/distroless/nodejs24-debian13
```
Then update each `FROM` line in `Dockerfile.hardened` to `FROM <image>@sha256:<digest>`.

## Build and compare

```bash
# Original
docker build -t juice-shop:original -f Dockerfile .

# Hardened
docker build -t juice-shop:hardened -f Dockerfile.hardened .

# Compare image sizes
docker images | grep juice-shop
```