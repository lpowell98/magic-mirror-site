#!/usr/bin/env bash
# Add the DNS records Resend needs to send website email from magicmirrorrentalservices.com.
# They live on resend._domainkey and send.<domain>, so the Google Workspace MX/SPF/DKIM
# records on the root domain are left untouched. Idempotent.
# Needs CLOUDFLARE_API_TOKEN, RESEND_DKIM (the TXT value Resend shows) and RESEND_REGION.
set -uo pipefail
DOMAIN=magicmirrorrentalservices.com
API=https://api.cloudflare.com/client/v4
OUT=${GITHUB_STEP_SUMMARY:-/dev/stdout}
cf() { curl -sS -X "$1" "$API$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" ${3:+--data "$3"}; }
ok() { jq -e '.success' >/dev/null <<<"$1"; }
err() { jq -r '[.errors[]? | "\(.code): \(.message)"] | join("; ")' <<<"$1"; }
note() { echo "$1" | tee -a "$OUT"; }
fail=0
DKIM=$(tr -d '"\r\n' <<<"$RESEND_DKIM" | sed 's/^ *//; s/ *$//')
case "$DKIM" in p=*) DKIM="$DKIM";; v=DKIM1*|*p=*) ;; *) DKIM="p=$DKIM";; esac

ZONE=$(cf GET "/zones?name=$DOMAIN" | jq -r '.result[0].id // empty')
[ -n "$ZONE" ] || { note "❌ zone not found"; exit 1; }

add() { # type fqdn content [priority]
  local type=$1 fqdn=$2 content=$3 prio=${4:-}
  local ex; ex=$(cf GET "/zones/$ZONE/dns_records?type=$type&name=$fqdn")
  if jq -e --arg c "$content" '.result[]? | select(.content==$c or .content==("\"" + $c + "\""))' <<<"$ex" >/dev/null; then note "- exists: $type $fqdn"; return; fi
  if [ "$type" = TXT ] && jq -e '.result | length > 0' <<<"$ex" >/dev/null; then
    note "- ❌ $fqdn already has a different TXT record; not overwriting"; fail=1; return; fi
  local body; body=$(jq -nc --arg t "$type" --arg n "$fqdn" --arg c "$content" --arg p "$prio" \
    '{type:$t,name:$n,content:$c,ttl:1,proxied:false} + (if $p=="" then {} else {priority:($p|tonumber)} end)')
  local r; r=$(cf POST "/zones/$ZONE/dns_records" "$body")
  if ok "$r"; then note "- added: $type $fqdn → ${content:0:50}"; else note "- ❌ $type $fqdn: $(err "$r")"; fail=1; fi
}
note "## Resend DNS for $DOMAIN"
add TXT "resend._domainkey.$DOMAIN" "$DKIM"
add MX "send.$DOMAIN" "feedback-smtp.$RESEND_REGION.amazonses.com" 10
add TXT "send.$DOMAIN" "v=spf1 include:amazonses.com ~all"

note "### Check (Cloudflare nameserver)"
NS=$(dig +short NS $DOMAIN | head -1)
for q in "TXT resend._domainkey.$DOMAIN" "MX send.$DOMAIN" "TXT send.$DOMAIN" "MX $DOMAIN" "TXT $DOMAIN"; do
  set -- $q; note "- $2 $1: $(dig +short @$NS $2 $1 | tr '\n' ' ' | cut -c1-90)"
done
exit $fail
