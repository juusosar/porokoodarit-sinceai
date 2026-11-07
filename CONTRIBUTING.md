# Contributing: git workflow

Goal: linear history on `dev` and `main`. One tidy commit per PR (or a few meaningful ones), no merge commits, no stacked "* fix" lists in messages.

## Repo settings (GitHub)
- Merge button: **Rebase and merge** only. Merge commits and squash merge are off.
- `dev` + `main`: linear history required (ruleset).
- Head branches auto-deleted after merge.

## Local setup (once)
```bash
git config pull.rebase true          # git pull rebases instead of merging
git config rebase.autoSquash true    # fixup! commits fold in automatically
git config rebase.updateRefs true    # stacked branches move together on rebase
git config push.autoSetupRemote true # first push creates origin/<branch>
```

## Branch + PR flow
```bash
git fetch origin
git switch -c POR-123-short-name --no-track origin/dev   # --no-track: else push targets dev
# ...work, commit with "POR-123: what changed"
git push
```
- Commit subject: `POR-<n>: <summary>`, imperative, <= 72 chars. Body explains why.
- Keep base current: `git fetch origin && git rebase origin/dev` (never `git merge dev` into a feature branch).
- Review fixes: commit as fixups, then fold before merge:
  ```bash
  git commit --fixup <sha>                       # per fix
  git rebase -i --autosquash origin/dev          # before merge
  git push --force-with-lease                    # own PR branch only
  ```
- Merge with **Rebase and merge**. CI `history` job fails on merge commits or leftover `fixup!`/`squash!` commits.

## Stacked PRs
PR B on top of PR A (base = A's branch):
1. Merge A (rebase). A's branch is auto-deleted, GitHub retargets B to `dev`.
2. Drop A's old commits from B:
   ```bash
   git fetch origin
   git rebase --onto origin/dev <A-old-tip> B
   git push --force-with-lease
   ```
   `<A-old-tip>`: local `A` branch, or last commit SHA on A's PR page (`origin/A` is gone after prune).
   (With `rebase.updateRefs`, rebasing B also moves local A while both are open; push A separately.)

## Never
- Force-push `dev` or `main`.
- Merge `dev` into a feature branch.
- Commit to `main` directly.

## Promoting dev to main
Not via rebase-merge PR: GitHub rebase-merge rewrites SHAs, so main and dev would diverge forever.
Fast-forward instead (maintainer, only when release is agreed):
```bash
git fetch origin
git merge-base --is-ancestor origin/main origin/dev && git push origin origin/dev:main
```
`main` ruleset must allow the maintainer to bypass "require PR" for this push (linear history still holds).
