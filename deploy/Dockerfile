# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Proxy image: Caddy with the routing baked in.
#
# The configuration used to be bind-mounted from the repository, which quietly
# made the repository a requirement: anyone who downloaded only the compose file
# hit a missing path. Shipping it inside the image keeps the advertised install
# — one compose file, one command — honest.
# ---------------------------------------------------------------------------
FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
