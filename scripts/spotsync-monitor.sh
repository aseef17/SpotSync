#!/usr/bin/env bash
set -u
REPO="/Users/aseef/Desktop/Google Places Project/place-lists-app"
LOG="$REPO/.spotsync-monitor.log"
PIDFILE="$REPO/.spotsync-monitor.pid"
PROJECT="places-maps-list-app"
DEPLOY_MARKER="$REPO/.last-deployed-sha"
FIRST_CYCLE=1

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

cd "$REPO" || exit 1
echo $$ > "$PIDFILE"
log "Monitor started (pid $$)"

needs_deploy() {
  git checkout main -q && git pull -q
  local head deployed
  head=$(git rev-parse HEAD)
  if [[ ! -f "$DEPLOY_MARKER" ]]; then return 0; fi
  deployed=$(cat "$DEPLOY_MARKER")
  [[ "$head" != "$deployed" ]]
}

do_deploy() {
  log "Deploy: npm run build + firebase deploy ($PROJECT)"
  if npm run build && firebase deploy --only firestore:rules,functions,hosting --project "$PROJECT"; then
    git rev-parse HEAD > "$DEPLOY_MARKER"
    log "Deploy: success"
  else
    log "Deploy: FAILED"
  fi
}

pr_superseded() {
  local n=$1
  local base head
  base=$(gh pr view "$n" --json baseRefName -q .baseRefName 2>/dev/null) || return 1
  head=$(gh pr view "$n" --json headRefOid -q .headRefOid 2>/dev/null) || return 1
  git fetch origin "$base" -q
  git merge-base --is-ancestor "$head" "origin/$base" 2>/dev/null
}

process_pr() {
  local n=$1
  log "PR #$n: review"
  gh pr view "$n" --json title,headRefName,isDraft,mergeable,url -q '"\(.number) \(.title) draft=\(.isDraft) mergeable=\(.mergeable) \(.url)"' 2>/dev/null | while read -r _; do log "PR #$n: $_"; done
  gh pr diff "$n" > /dev/null 2>&1 || log "PR #$n: diff unavailable"
  gh pr checks "$n" 2>&1 || log "PR #$n: checks fetch issue"

  if pr_superseded "$n"; then
    if gh pr close "$n" --comment "Closing: changes already on main (superseded)."; then
      log "PR #$n: closed (superseded)"
    else
      log "PR #$n: superseded but close failed"
    fi
    return 0
  fi

  local branch
  branch=$(gh pr view "$n" --json headRefName -q .headRefName)
  git fetch origin "$branch" -q
  git checkout "$branch" -q || { log "PR #$n: checkout failed"; git checkout main -q; return 1; }

  if npm run check; then
    log "PR #$n: check passed"
  else
    log "PR #$n: check failed — no auto-fix attempted"
    git checkout main -q
    return 1
  fi

  local draft mergeable
  draft=$(gh pr view "$n" --json isDraft -q .isDraft)
  if [[ "$draft" == "true" ]]; then
    gh pr ready "$n" && log "PR #$n: marked ready" || log "PR #$n: ready failed"
  fi

  mergeable=$(gh pr view "$n" --json mergeable -q .mergeable)
  if [[ "$mergeable" == "MERGEABLE" ]]; then
    if gh pr merge "$n" --merge --delete-branch; then
      log "PR #$n: merged"
    else
      log "PR #$n: merge failed"
    fi
  else
    log "PR #$n: not mergeable ($mergeable)"
  fi
  git checkout main -q
}

while true; do
  log "=== Cycle start ==="
  git checkout main -q 2>/dev/null || log "WARN: checkout main failed"
  git pull -q 2>/dev/null || log "WARN: pull failed"

  if [[ "$FIRST_CYCLE" == "1" ]]; then
    FIRST_CYCLE=0
    if needs_deploy; then do_deploy; else log "Deploy: skip (HEAD matches marker)"; fi
  fi

  if ! gh pr list --state open --json number,title,author,headRefName,url,isDraft,mergeable > /tmp/spotsync-prs.json 2>/dev/null; then
    log "ERROR: gh pr list failed"
    log "=== Cycle end (error), sleep 300s ==="
    sleep 300
    continue
  fi

  pr_numbers=$(gh pr list --state open --json number -q '.[].number' 2>/dev/null || true)
  if [[ -z "$pr_numbers" ]]; then
    log "No open PRs"
  else
    pr_count=$(echo "$pr_numbers" | wc -l | tr -d ' ')
    log "Open PRs: $pr_count"
    for n in $pr_numbers; do
      process_pr "$n" || true
    done
  fi

  log "=== Cycle end, sleep 300s ==="
  sleep 300
done
