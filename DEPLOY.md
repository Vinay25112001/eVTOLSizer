# Publishing to GitHub and evtolsizer.live

This repository deploys itself. Pushing to the branch named `main` runs
`.github/workflows/deploy.yml`, which **runs every verification gate in `npm test`
first** and publishes to GitHub Pages only if they pass. `CNAME` points that
at **evtolsizer.live**, so a successful push updates the live site with no
further action — and a failing gate stops it.

The gates are not a second copy living in the deploy workflow. It calls
`verify.yml` with `uses:`, the same workflow a pull request runs, so the
checks a reviewer sees and the checks that guard the live site cannot drift
apart. Before 2026-09-09 they were two independent workflows started by the
same push, with nothing connecting them: the site went live while the golden
master was red, because a failure in one workflow has no bearing on a
deployment in another.

Read the pre-flight list before the first push. Two of its items are the
kind that fail silently.

---

## Pre-flight

**1. The local branch is `master`; the workflow watches `main`.**
Nothing deploys until those agree. Either push across the names:

```bash
git push origin master:main
```

or rename locally first, which is less surprising afterwards:

```bash
git branch -m master main
git push -u origin main
```

**2. Repository secrets must exist, under the names the workflow reads.**
Settings → Secrets and variables → Actions:

| secret | used for | absent means |
| --- | --- | --- |
| `VITE_EMAILJS_SERVICE_ID` | one-time-password email | **deploy fails** |
| `VITE_EMAILJS_TEMPLATE_ID` | one-time-password email | **deploy fails** |
| `VITE_EMAILJS_PUBLIC_KEY` | one-time-password email | **deploy fails** |
| `VITE_SUPABASE_URL` | accounts, saved designs | local-only auth |
| `VITE_SUPABASE_KEY` | accounts, saved designs | local-only auth |
| `VITE_GROQ_KEY` | AI assistant tab | assistant disabled |

The workflow maps these secret names onto the environment variable names
the source actually reads, which are different — `VITE_EMAILJS_SERVICE_ID`
becomes `VITE_EMAILJS_SERVICE`, and so on. That mapping was wrong until
2026-09-08 and all three EmailJS values reached the bundle as `undefined`,
so the OTP path was dead on the live site while every signal said it was
fine. `npm test` now runs `validation/deploy-env.mjs`, which compares what
the source reads against what the workflow supplies and fails if a variable
with no fallback is missing.

The three EmailJS secrets stop the deploy outright if empty. They are read
with `|| ""`, so nothing crashes at build time, but `AuthSystem.jsx` throws
"Email delivery is not configured" the moment a visitor tries to sign up —
the fallback breaks the feature rather than disabling it, and it breaks on
their screen. `VITE_SSO_CODE` is the contrast: `?? ""` genuinely disables
single sign-on, which is the intended secure default, so it is not required.

That check used to be three `if [ -z ... ]` tests against
`VITE_EMAILJS_SERVICE_ID` while its own env block supplied
`VITE_EMAILJS_SERVICE`. It read variables that were never set, printed
"WARNING: ... is empty!" on every run no matter what the secrets held, and
exited 0 regardless. It now tests the names the build receives, and fails.

`VITE_SSO_CODE` and `VITE_AUTH_MODE` are deliberately NOT set. Single
sign-on is disabled when the code is empty, which is the secure default.

**3. Rotate anything that was ever committed in the clear.**
Earlier revisions of this repository contained live EmailJS identifiers and
an SSO code in the source. They are gone from the working tree, but git
history is public once the repository is. Rotate them at the provider
before publishing, and treat the old values as compromised.

**4. Confirm ownership before making it public.**
`LICENSE` is Apache-2.0 and `CITATION.cff` credits Vinay Kumar Reddy
Sirigireddy. Commit authorship was reconciled to
`<sirigireddy.vinaykumarreddy@wright.edu>` on 2026-09-08, so the email in the
history now agrees.

Ownership itself is the larger question. Work produced at a university is
often institution-owned regardless of who wrote it. Settle that in writing
first — it is far harder to withdraw a public repository than to delay one.

**5. The working copy's git identity is still the old address.**
`.git/config` in this working copy still holds the superseded wright.edu
address under `[user]`. Every commit in the history was rewritten off it and
the tree contains it nowhere, but that setting is what the NEXT commit made
here would use, which would put it straight back. Check it and set it by hand
— `git config user.email` reports what is currently in force:

```bash
git config user.email "sirigireddy.vinaykumarreddy@wright.edu"
git config user.name  "Vinay Kumar Reddy Sirigireddy"
```

The name is worth settling at the same time — it is currently the project
name, "Wright State eVTOL Sizer", and that string is what a citation carries.

---

## Pushing

### If the GitHub repository already shares this history

```bash
git remote add origin https://github.com/<you>/<repo>.git   # if not set
git fetch origin
git log --oneline origin/main..HEAD | wc -l                  # what you are about to add
git push origin master:main
```

### If it does not share history

Force-pushing would discard whatever is on GitHub. Look first:

```bash
git fetch origin
git log --oneline origin/main -5      # what is there now
git merge-base HEAD origin/main       # empty output means no common ancestor
```

With no common ancestor, decide deliberately. To keep the GitHub history and
add this work on top of it:

```bash
git remote add github https://github.com/<you>/<repo>.git
git fetch github
git checkout -b publish github/main
git checkout master -- .              # take this tree, keep their history
git commit -m "Update from eVTOL Sizer working repository"
git push github publish:main
```

To replace it entirely, `--force` does that and destroys the remote history.
Take a bundle of the remote first: `git bundle create backup.bundle --all`.

### From the bundle instead

Two bundles are built, both verifying with `git bundle verify`:

| file | contents |
| --- | --- |
| `eVTOLSizer-RELEASE-single-commit.bundle` | one commit on `main` — the publishable tree with no development history |
| `eVTOLSizer-FULL-HISTORY-114-commits.bundle` | the complete history on `master`, as a backup |

The release bundle is the one to publish. It clones straight onto the branch
the workflow watches:

```bash
git clone eVTOLSizer-RELEASE-single-commit.bundle eVTOLSizer
cd eVTOLSizer                      # already on `main`, one commit
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`eVTOLSizer-SOURCE.zip` is the same tree as a plain archive, for uploading
through the GitHub web interface instead. Both are built from `git archive`
and `git bundle` over TRACKED files, so neither can carry an untracked file
that builds here and is missing on the runner — the failure that broke the
first deployment.

---

## After the push

1. Actions tab — the run has two jobs and both must be green: **verify**
   (every gate in `npm test`) and then **build-and-deploy**. If `verify` is red nothing
   is published, and the live site keeps serving the previous build.
2. Settings → Pages — source is GitHub Actions, custom domain
   `evtolsizer.live`, **Enforce HTTPS** on.
3. Open the live site and check the three things that fail quietly:
   - sign-up sends an OTP email (proves the EmailJS mapping works)
   - a design saves and reloads (proves Supabase is reachable)
   - a tab deep-link works, e.g. `?tab=9&theme=dark`

## Cutting a release

The version lives only in `package.json`; see the top of CHANGELOG.md for
the rules and `validation/release.mjs` for the check.

1. Set `package.json` `version` to `X.Y.Z` (drop `-dev`).
2. In CHANGELOG.md rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`.
3. In CITATION.cff set `version` and `date-released` to match.
4. `npm test` (the release gate checks all three), `npm run report`, commit.
5. `git tag -a vX.Y.Z -m "vX.Y.Z"` and push the tag with the branch. With the
   Zenodo GitHub integration enabled, publishing a GitHub release from the
   tag mints a DOI for that version.
6. Start the next cycle: `X.Y.(Z+1)-dev` or `X.(Y+1).0-dev` and a new
   `## [Unreleased]` section.

## Verifying before you push

```bash
npm install
npm test          # every gate; all must pass
npm run build     # must succeed
```

`npm test` includes `deploy-env.mjs`, so a variable mismatch fails here
rather than on the live site.

To audit the rendered interface, which needs a browser and a port:

```bash
npm run build && npx vite preview --port 5401 &
node validation/ui-audit.mjs
```

That currently reports 78 contrast findings in light mode and a 5 px sidebar
overflow. Both are open and neither blocks deployment.
