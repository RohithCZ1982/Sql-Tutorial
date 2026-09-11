# Working agreement for this repository

## Branches

- **All work happens on `main`.** Make every commit there and push to `main`.
- **Never touch `claude/sql-server-azure-training-wpt58m`.** Do not commit to it,
  push to it, merge into it, rebase it, retarget it, or delete it. Leave it
  exactly as it is. It still holds a full copy of the earlier files, and that is
  deliberate.
- Do not create additional branches unless asked for one.

## Current state (11 Sep 2026)

`main` intentionally contains no project files. The contents were removed in
`5e8311c` at the owner's request. The history is intact, so nothing is lost and
anything can be brought back:

| What | Recover with |
| --- | --- |
| SQL Server to Azure teaching notes — one self-contained, responsive HTML page (~280 KB) | `git show 758dcaf:index.html` |
| SQL Window demo — Express server, Postgres query console | `git show 9a51e9c:server.js`, `git show 9a51e9c:public/sql.html` |
| Full file set as it stood before the wipe | `git checkout 9a51e9c -- .` |

## Known constraint

The repository's default branch is still
`claude/sql-server-azure-training-wpt58m`, not `main`. GitHub refuses to delete
a default branch, so that branch cannot be removed until the owner switches the
default under **Settings → General → Default branch**. This is a repository
setting and cannot be changed from a Claude Code session.
