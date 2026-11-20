#!/usr/bin/env bash
# One-time: put magicmirrorrentalservices.com on Cloudflare DNS and attach it to the Pages site.
# Idempotent: re-running skips anything that already exists.
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
set -uo pipefail
DOMAIN=magicmirrorrentalservices.com
PROJECT=magic-mirror-site
API=https://api.cloudflare.com/client/v4
ACCT=$CLOUDFLARE_ACCOUNT_ID
OUT=${GITHUB_STEP_SUMMARY:-/dev/stdout}
DKIM='v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy7k+BCKc3gqg44FDkq/9XS37E3d5RyWfYrUBhBLebDL1x5biFVDtjEEdsxDSV5b2XFMQS3dmjrz01tmTGQbbhqF1w9pNhcJ4pea7k6jqUJ0ppI7O6FJNV9M0T32uKWLyOsElx/9j4pT7iZWa9WIONv7uFbIvefJeIn2BEOYy1rxcTojd8ortohIe6ZsHrSDAITams9+iqRvsFw2iUEJsNic9ghvFsc7eo9Hf7Ps5RHAuetecXzZYy1GgsA74TkhTeLuh6qOQ4GywuyHv5fODaDXhIQZpwVewZOY5hGenLXLRv4rJnsrwU5FHs0spnj/MH5hMWNuQtnhQl1vg7RVqOQIDAQAB'

cf() { # method path [json]
  curl -sS -X "$1" "$API$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" ${3:+--data "$3"}
}
ok() { jq -e '.success' >/dev/null <<<"$1"; }
err() { jq -r '[.errors[]? | "\(.code): \(.message)"] | join("; ")' <<<"$1"; }
fail=0
note() { echo "$1" | tee -a "$OUT"; }

note "## Domain setup for $DOMAIN"

# 1. Zone
r=$(cf GET "/zones?name=$DOMAIN")
ZONE=$(jq -r '.result[0].id // empty' <<<"$r")
if [ -z "$ZONE" ]; then
  r=$(cf POST /zones "{\"name\":\"$DOMAIN\",\"account\":{\"id\":\"$ACCT\"},\"type\":\"full\"}")
  if ok "$r"; then ZONE=$(jq -r .result.id <<<"$r"); note "- Created zone"; else note "- ❌ Could not create zone: $(err "$r")"; exit 1; fi
else note "- Zone already exists"; fi
r=$(cf GET "/zones/$ZONE")
STATUS=$(jq -r .result.status <<<"$r")
note "- Zone status: **$STATUS**"
if [ "$STATUS" = pending ]; then cf PUT "/zones/$ZONE/activation_check" >/dev/null && note "- Asked Cloudflare to re-check the nameservers now"; fi
note "- **Nameservers to set at Squarespace:** $(jq -r '.result.name_servers | join(", ")' <<<"$r")"

# 2. DNS records
add() { # type name content [priority] [proxied]
  local type=$1 name=$2 content=$3 prio=${4:-} prox=${5:-false} fqdn
  [ "$name" = "@" ] && fqdn=$DOMAIN || fqdn="$name.$DOMAIN"
  local ex; ex=$(cf GET "/zones/$ZONE/dns_records?type=$type&name=$fqdn")
  if jq -e --arg c "$content" '.result[]? | select(.content==$c or .content==("\"" + $c + "\""))' <<<"$ex" >/dev/null; then note "- exists: $type $fqdn → ${content:0:40}"; return; fi
  local body; body=$(jq -nc --arg t "$type" --arg n "$fqdn" --arg c "$content" --arg p "$prio" --argjson x "$prox" \
    '{type:$t,name:$n,content:$c,ttl:1,proxied:$x} + (if $p=="" then {} else {priority:($p|tonumber)} end)')
  local r; r=$(cf POST "/zones/$ZONE/dns_records" "$body")
  if ok "$r"; then note "- added: $type $fqdn → ${content:0:40}"; else note "- ❌ $type $fqdn: $(err "$r")"; fail=1; fi
}
# Remove old Squarespace website records (apex A, www CNAME) that the import may have copied.
for id in $(cf GET "/zones/$ZONE/dns_records?per_page=100" | jq -r --arg d "$DOMAIN" '.result[]? | select((.type=="A" and .name==$d and (.content|test("^198\\.(185\\.159|49\\.23)\\."))) or (.type=="CNAME" and .name==("www."+$d) and .content=="ext-sq.squarespace.com")) | .id'); do
  cf DELETE "/zones/$ZONE/dns_records/$id" >/dev/null && note "- removed old Squarespace record $id"
done
add MX @ aspmx.l.google.com 1
add MX @ alt1.aspmx.l.google.com 5
add MX @ alt2.aspmx.l.google.com 5
add MX @ alt3.aspmx.l.google.com 10
add MX @ alt4.aspmx.l.google.com 10
add TXT @ "v=spf1 include:_spf.google.com ~all"
add TXT google._domainkey "$DKIM"
add A booking 77.68.123.80 "" false
add CNAME @ "$PROJECT-gna.pages.dev" "" true
add CNAME www "$PROJECT-gna.pages.dev" "" true

# 3. Pages custom domains
for d in "$DOMAIN" "www.$DOMAIN"; do
  r=$(cf GET "/accounts/$ACCT/pages/projects/$PROJECT/domains/$d")
  if ok "$r"; then note "- Pages domain $d: $(jq -r .result.status <<<"$r")"; continue; fi
  r=$(cf POST "/accounts/$ACCT/pages/projects/$PROJECT/domains" "{\"name\":\"$d\"}")
  if ok "$r"; then note "- Pages domain $d added: $(jq -r .result.status <<<"$r")"; else note "- ❌ Pages domain $d: $(err "$r")"; fail=1; fi
done
exit $fail
