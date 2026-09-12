# KickRadar — operational notes for Claude

## Branches

- **Production branch is `claude/backend-code-project-fmcfrm`, NOT `main`.**
  Vercel deploys to production from this branch. Always check
  `git remote show origin` / ask before assuming `main` is the default —
  it isn't in this repo.
- Feature work happens on `claude/*` branches and gets merged into
  `claude/backend-code-project-fmcfrm` via PR.

## Merging a PR into the production branch — squash only

**Always merge PRs into `claude/backend-code-project-fmcfrm` with
`merge_method: "squash"`, never `"merge"`.**

Confirmed live 2026-09-12 (PR #81): merging with the regular `"merge"`
method created a two-parent merge commit. That push landed correctly on
GitHub, but Vercel's GitHub integration never picked it up — no new
deployment appeared in the project's history at all, even several minutes
later, and the production alias (`kick-radar-eosin.vercel.app`,
`kick-radar-alessio21.vercel.app`) kept serving the old commit. Every
prior merge to this branch (all squash-merges, or a direct single-parent
push) had always triggered a build without issue.

Root cause not 100% proven (could be the two-parent commit shape
specifically, could have been a one-off dropped webhook), but squash-merge
is what this repo's history already consistently uses (every past PR
merge — #77, #78, #79, #80 — shows as a single linear commit with `(#N)`
in the message), so stick with it rather than re-testing the theory.

**If you ever do end up with a stuck/un-deployed merge commit:** don't
force-push to fix the branch shape (that's blocked by the sandbox as a
destructive git operation, and isn't worth the risk). Instead, push one
more ordinary, real commit straight to `claude/backend-code-project-fmcfrm`
via the GitHub API (`create_or_update_file` or similar) — a plain
single-parent push has always been enough to get Vercel building again.

## After merging — verify the deploy actually landed

Don't tell the user something is "live" or "testable" just because the
PR merged. Vercel deploys asynchronously and (per above) can silently miss
a push. Before saying it's ready to test:

1. `mcp__Vercel__list_deployments` (project `kick-radar`,
   `prj_XWFSU0ox6z2d6eydFCa2XAWYeHg2`, team `team_A755M89u3KhsWSROs3kgziLM`)
   and confirm a deployment exists whose `githubCommitSha` matches the
   merge commit, with `target: "production"` and `state: "READY"`.
2. Or `mcp__Vercel__get_deployment` on `kick-radar-eosin.vercel.app` (the
   real production alias) and check its `meta.githubCommitSha` matches
   what you just merged.
3. Only then tell the user it's live and where (production URL, not the
   preview-deployment/PR-branch URL — preview deployments are behind
   Vercel SSO protection and the user can't open them without a Vercel
   login).

## Branch cleanup — can't delete branches with available tools

Confirmed live 2026-09-12: neither `git push origin --delete <branch>`
(HTTP 403 from the git remote — the provisioned push credential has no
delete-ref permission) nor the GitHub MCP server (no delete-branch/
delete-ref tool exposed at all) can delete a branch. Don't spend time
retrying either approach.

If asked to clean up stale branches: do the analysis (compare each branch
against `claude/backend-code-project-fmcfrm` with `git rev-list
--left-right --count`, check `git merge-base --is-ancestor` for "already
fully merged", read the unique commits to judge whether anything is
actually unmerged/valuable), present the findings and a delete
recommendation, but then hand the actual deletion to the user —
https://github.com/alessio302/KickRadar/branches, trash icon per branch,
seconds per branch. Don't promise to delete them yourself.

## Vercel project reference

- Project: `kick-radar`, id `prj_XWFSU0ox6z2d6eydFCa2XAWYeHg2`
- Team: `alessio21` / `team_A755M89u3KhsWSROs3kgziLM`
- Production aliases: `kick-radar-eosin.vercel.app`,
  `kick-radar-alessio21.vercel.app`
- Preview deployments have SSO protection enabled — don't hand the user a
  preview URL and expect them to be able to open it.
- Root directory for the Vite app is `web/` (repo root has no
  package.json).
