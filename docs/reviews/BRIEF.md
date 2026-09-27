# Reviewer brief — an informal internal technical review of the eVTOL Sizer

*Prepared 2026-09-27 for whoever the holder asks to review. It is the one credibility factor
no further engineering can move.*

## Why you are being asked

The tool's validation report (`VALIDATION.md`, generated, not written) assesses itself against
NASA-STD-7009B, *Standard for Models and Simulations*, Appendix E. Two of its eleven factors
score **0, "insufficient evidence"**: *M&S Development Technical Review* and *M&S Use/Analysis
Technical Review*. The report's own words: "No part of this work — not the methods, not the code,
not the results — has been reviewed by anyone other than its author. Under 7009B even level 1
requires a favorable *informal internal* peer review, and self-review does not qualify."

Level 1 on both factors, in the standard's own words (Table 10 / Table 19): "Favorable informal
internal peer review. Scope addresses Data Pedigree, Verification, and Validation factors, at a
minimum." A "peer review" is "an assessment that is conducted by one or more persons of equal
technical standing to person(s) responsible for the work"; an "informal" one "is not conducted
pursuant to a process established by the reviewed or reviewing organization" (E.3.5). So this
brief asks one peer to read a defined slice, cover those three factors, and record an opinion.
It does not ask for a formal or independent review (levels 2-4), and it does not ask you to
re-run the physics. The standard also says what the record must show: scope and depth, who
reviewed and their association with the project, and when (E.3.5).

## What to review (two hours, three artefacts, three factors)

The three factors the standard names are mapped to the three artefacts: **Data Pedigree** is
`VALIDATION.md` section 2 and the provenance registry it describes; **Verification** is the gate
you run in artefact 2; **Validation** is section 4 and the claim gate in artefact 3.

1. **`VALIDATION.md`, sections 1, 2, 4 and 7-9** (purpose and permissible uses; referent
   pedigree; every published comparison; the credibility assessment; caveats; risks). Question
   to answer: *does the report claim less than, and not more than, the evidence supports?*
2. **One worked finding, end to end** — the rotor-group case:
   `eVTOL_Sizing_Research/benchmarks/nasa-ndarc-decks.md` (the research), then
   `src/engine/rotorgroup.js` (the model, header first), then `validation/rotor-group.mjs` (the
   gate). Question: *is every number in the model traceable to the cited page or deck line, and
   does the gate test what the header claims?* This case was chosen because its earlier
   conclusion was wrong, the record of that is kept, and a reviewer can see how the tool corrects
   itself.
3. **The VFS Forum 83 abstract** (`paper/VFS-Forum-83-abstract.md`). Question: *would you put
   your name next to it?* Every number in it is held to the harnesses by
   `validation/paper-claims.mjs`; the claim gate is worth running once to see it work.

## How to run what you read

```
cd eVTOLSizer-main
npm install
node validation/rotor-group.mjs        # ~5 s, the worked finding's gate
node validation/paper-claims.mjs       # ~2 min, every number in the abstract
npm test                               # ~25 min, the whole gate
npm run report && npm run report:check # regenerate VALIDATION.md and prove it is current
```

## What the tool will say about you afterwards

The credibility table in `VALIDATION.md` section 7 will be changed from 0 to 1 on the two review
factors only when a review record exists. The record is a short file in `docs/reviews/` with:
your name and role, the date, the artefacts read (by commit hash), your opinion (favourable or
not) on each of the three questions above, and any findings. Findings are logged as issues in the
repository, not fixed silently. If the opinion is unfavourable the factors stay at 0 and the
record is still kept: the standard asks that the level be determined and reported, not that it be
good.

## What you are not being asked

- Not to certify anything. The report states, and the regulation (CS 27.29) requires, that empty
  weight is established by weighing, so no prediction tool can carry certification credit.
- Not to agree with the method choices. Disagreement is a finding, and findings are the point.
- Not to review the 106 harnesses. Three artefacts, three questions.

## Commit to review against

`shared-auth` at the commit named in the request that accompanies this brief; `VALIDATION.md`'s
header states the commit it describes, and `npm run report:check` proves it is that one.
