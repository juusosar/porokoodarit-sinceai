# Contributing: git workflow

Goal: linear history on `main`, the project's one long-lived branch (dev was migrated onto it on 8 Nov 2026). One tidy commit per PR (or a few meaningful ones), no merge commits, no stacked "* fix" lists in messages.

## Repo settings (GitHub)
- Merge button: **Rebase and merge** only. Merge commits and squash merge are off.
- `main`: linear history required (ruleset). Default branch and production branch (Vercel, Cloud Run deploys).
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
git switch -c POR-123-short-name --no-track origin/main   # --no-track: else push targets main
# ...work, commit with "POR-123: what changed"
git push
```
- Commit subject: `POR-<n>: <summary>`, imperative, <= 72 chars. Body explains why.
- Keep base current: `git fetch origin && git rebase origin/main` (never `git merge main` into a feature branch).
- Review fixes: commit as fixups, then fold before merge:
  ```bash
  git commit --fixup <sha>                       # per fix
  git rebase -i --autosquash origin/main          # before merge
  git push --force-with-lease                    # own PR branch only
  ```
- Merge with **Rebase and merge**. CI `history` job fails on merge commits or leftover `fixup!`/`squash!` commits.

## Stacked PRs
PR B on top of PR A (base = A's branch):
1. Merge A (rebase). A's branch is auto-deleted, GitHub retargets B to `main`.
2. Drop A's old commits from B:
   ```bash
   git fetch origin
   git rebase --onto origin/main <A-old-tip> B
   git push --force-with-lease
   ```
   `<A-old-tip>`: local `A` branch, or last commit SHA on A's PR page (`origin/A` is gone after prune).
   (With `rebase.updateRefs`, rebasing B also moves local A while both are open; push A separately.)

## Never
- Force-push `main`.
- Merge `main` into a feature branch.
- Commit to `main` directly.

## History
Until 8 Nov 2026 work landed on `dev` and `main` held the swing research code. The final PR rebased all of
`dev` onto `main` (research commits kept), so `main` has the full history. `dev` is retired.
