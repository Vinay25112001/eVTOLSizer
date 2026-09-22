# Pushing this repo and getting a DOI

Prepared so the part only you can do takes about ten minutes. Nothing here has
been run: creating the repo and the Zenodo deposit needs your accounts.

**Decision already made:** private now, public at submission. Public is
effectively irreversible once indexed, and the paper's "openly available" claim
only has to be true on 9 October.

## 1. Push (private) — DONE 2026-09-22

The repository is **`Vinay25112001/eVTOLSizer`**, private, and `master` now
tracks its `main`. Note the name: it is `eVTOLSizer`, NOT `evtol-sizer`. The
latter is the npm PACKAGE name in `package.json` and the two were conflated
here and in `CITATION.cff` and `README.md` until 2026-09-22, which left a
citation pointing at a URL that 404s.

What was actually on the remote is worth recording, because it is the reason
the first push could not be a fast-forward. `main` held **58 commits** ending
at `db98add` (2026-09-09, "Add files via upload"), uploaded through the GitHub
web UI, which had FLATTENED the directory structure: `engine.js`,
`ConvergenceTab.jsx`, `golden-master.mjs` and a duplicate `deploy.yml` sat at
the repository root, `.gitignore` had lost its leading dot and so did nothing,
and there was a file named `0`. It shared **no common ancestor** with this
tree. The 239-commit local history replaced it with

```
git push --force-with-lease=main:db98add -u origin master:main
```

`--force-with-lease` rather than `--force`, pinned to the fetched head, so the
push would abort rather than clobber if anything had changed meanwhile. The
old remote history is preserved and verified complete in
`../eVTOLSizer-REMOTE-backup-20260922.bundle`, including both `copilot/*`
branches, which were left untouched on the remote.

To push again from a fresh clone of this working copy:

```
git remote add origin https://github.com/Vinay25112001/eVTOLSizer.git
git push -u origin master:main
```

Nothing in the repo needs redacting: `.gitignore` excludes `node_modules/`,
`dist/` and `.env*`; only a safe `.env.example` is tracked; a secret scan
before the first commit returned nothing.

## 2. Before making it public (at submission, not now)

- [x] **Licence chosen: Apache-2.0** (2026-09-04). `LICENSE` holds the
      canonical 202-line text fetched verbatim from apache.org, `NOTICE`
      carries the copyright line and the third-party/reference statement,
      and `license` is set in both `package.json` and `CITATION.cff`.

      Apache-2.0 over MIT for one reason that bears on the stated goal: it
      grants patent rights EXPLICITLY. MIT is silent on patents, which leaves
      a company's counsel an open question to assess before engineers may use
      the tool in a design study. Apache answers it in the text.

- [ ] **CONFIRM WHO OWNS THE COPYRIGHT BEFORE THE REPO GOES PUBLIC.** This is
      the one step that cannot be done from a keyboard. A licence is a grant
      of rights, so it is only valid if the grantor holds those rights.
      University IP policy commonly assigns ownership of work created with
      substantial institutional resources or in the course of employment, and
      a graduate assistantship or grant funding usually changes the answer
      again. If Wright State owns this, the holder line in `NOTICE` is wrong
      and only the university can license it.

      One email to the Wright State technology transfer / research
      commercialisation office settles it: describe the tool, say it was
      developed as [coursework / thesis work / assistantship-funded research],
      and ask whether the author may release it under Apache-2.0 and who
      should be named as copyright holder. Get the answer IN WRITING and keep
      it — an industry legal review will ask for exactly this, and "I assumed
      it was mine" is the answer that stops adoption.

      Until then `NOTICE` names the author, which is the right placeholder if
      the work is his and a one-line edit if it is not.
- [x] Name filled in `CITATION.cff` and `paper/VFS-Forum-83-abstract.md`.
- [x] Fill `repository-code:` in `CITATION.cff` — CORRECTED 2026-09-22 to
      https://github.com/Vinay25112001/eVTOLSizer. It was set to
      `.../evtol-sizer` on 2026-09-06, which is the npm PACKAGE name and not
      the repository; that URL 404s. `README.md` carried the same wrong clone
      URL and is fixed too. The package name in `package.json`, the
      `import ... from "evtol-sizer"` examples in `docs/API.md` and the
      `npx evtol-size` command are all CORRECT and were deliberately left
      alone — the two names are genuinely different things.
- [ ] **Rotate the credentials found during the first push.** The EmailJS
      service/template/key and the SSO code were hardcoded and shipped in the
      deployed bundle, so they are compromised and only the account owner can
      rotate them. New EmailJS credentials, and a new VITE_SSO_CODE or an
      empty one to keep SSO sign-up disabled.

      **They are NO LONGER IN HISTORY, and that changes nothing about the
      rotation.** This item previously said they "remain in all 87 commits";
      that is now false. A scan of all 239 commits on 2026-09-22 — for
      `service_*` / `template_*` identifiers, `emailjs.init` literals,
      `SSO_CODE` assignments, Supabase URLs and JWTs, and `gsk_*` keys —
      found only placeholders such as `your-project.supabase.co`. The
      2026-09-08 authorship rewrite replaced every commit, and the secrets had
      already been removed from source in 8eb6747. Scrubbing history does not
      un-publish a credential that was served to browsers, which is why this
      box stays unticked.
- [x] Reconcile authorship — DONE 2026-09-08. Every commit was authored
      under an unrelated institutional address while CITATION.cff
      credits Vinay Kumar Reddy Sirigireddy, and a citable artifact needs the
      two to agree. All 109 commits were rewritten to
      <sirigireddy.vinaykumarreddy@wright.edu>. The tree hash is unchanged at
      d750ef1, so not one byte of content moved; only the authorship did.
      Commit hashes all changed, which is safe because nothing had been pushed.
      The author NAME is still the project name rather than the person; decide
      whether that should also become "Vinay Kumar Reddy Sirigireddy" before
      minting a DOI, since that is the string a citation will carry.

## 3. Zenodo DOI

1. Sign in to zenodo.org with your GitHub account.
2. Settings -> GitHub, flip the switch **on** for `eVTOLSizer`.
   Zenodo only sees public repos, so this is a step-2 action, not today.
3. In GitHub: Releases -> Draft a new release, tag `v0.1.0`, publish.
4. Zenodo archives that tag and mints a DOI. The badge goes in the README and
   the DOI goes in the paper's availability statement.

`CITATION.cff` is already in the repo, so GitHub will show a "Cite this
repository" button and Zenodo will read the metadata from it.

## 4. What the paper needs from this

The abstract states the tool, harnesses, research notes and generated
validation report "are open and will be cited by permanent link, so that every
number here can be re-derived by a reader rather than taken on trust." That
sentence is currently FALSE - there is no remote and no DOI. It becomes true at
step 3, and it should not be submitted before it is.
