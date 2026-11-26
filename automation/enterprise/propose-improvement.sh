#!/usr/bin/env bash
set -euo pipefail
signature=$1
report=$2
base=$3
[[ "$signature" =~ ^[a-f0-9]{16}$ ]]
git check-ref-format --branch "$base" >/dev/null
branch="draqon/regression-$signature"
target="docs/draqon/proposals/$signature.md"
# A previously reviewed/closed proposal remains in the audit trail, even if its branch was deleted.
existing=$(gh pr list --state all --base "$base" --head "$branch" --json isCrossRepository --jq '[.[] | select(.isCrossRepository == false)] | length')
[[ "$existing" =~ ^(0|[1-9][0-9]*)$ ]]
if [[ "$existing" != 0 ]]; then exit 0; fi

# A failed PR-creation call may have left its branch behind. Verify the prospective diff before reusing it.
probe=0
git ls-remote --exit-code --heads origin "refs/heads/$branch" >/dev/null || probe=$?
case "$probe" in
  0)
    git fetch --quiet origin "refs/heads/$branch"
    [[ "$(git diff --name-only "HEAD...FETCH_HEAD")" == "$target" ]]
    [[ "$(git ls-tree FETCH_HEAD -- "$target" | cut -d' ' -f1)" == 100644 ]]
    # A retry can have different timings and therefore a different evidence digest.
    # Every other byte of an abandoned proposal must match the trusted local template.
    saved=$(mktemp)
    trap 'rm -f -- "$saved"' EXIT
    git show "FETCH_HEAD:$target" >"$saved"
    for proposal in "$saved" "$report"; do
      grep -Fx "Failure signature: $signature" "$proposal" >/dev/null
      [[ "$(grep -Ec '^Evidence digest: [0-9a-f]{64}$' "$proposal")" == 1 ]]
    done
    sed_digest='s/^Evidence digest: [0-9a-f]{64}$/Evidence digest: verified/'
    diff -q <(sed -E "$sed_digest" "$saved") <(sed -E "$sed_digest" "$report") >/dev/null
    ;;
  2)
    git switch -c "$branch"
    mkdir -p docs/draqon/proposals
    cp -- "$report" "$target"
    git add -- "$target"
    git -c user.name="DRAQON QA" -c user.email="actions@users.noreply.github.com" commit -m "Record observed regression for engineering review" -- "$target"
    git push origin "HEAD:refs/heads/$branch"
    ;;
  *) exit "$probe" ;;
esac
gh pr create --base "$base" --head "$branch" --draft --title "DRAQON regression review $signature" --body-file "$report"
