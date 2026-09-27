# Review records

`VALIDATION.md` section 7 scores two NASA-STD-7009B factors, *M&S Development Technical Review* and
*M&S Use/Analysis Technical Review*, at **0** until a review record exists here. The brief that asks
for the review is `BRIEF.md` in this folder. The record is what the standard's E.3.5 says a peer
review must show: scope and depth, who reviewed and their association with the project, and when.

The report generator reads every `*.md` in this folder except `README.md` and `BRIEF.md`, parses
the front matter below with `src/lib/review-record.js`, and sets both factors to **1** only if at
least one record is a favourable opinion on all three factors by someone who is not the author.
An unfavourable record is kept and the factors stay at 0: the standard asks that the level be
determined and reported, not that it be good. `validation/review-record.mjs` gates the rule.

## Record format

File name `YYYY-MM-DD-<reviewer-slug>.md`. Front matter, all fields required:

```
---
reviewer: <name>
role: <what they do; "equal technical standing" is the standard's test>
association: <relation to the project, e.g. "colleague, not a contributor" — "author" or "self" disqualifies>
date: YYYY-MM-DD
commit: <the shared-auth commit reviewed, 7 to 40 hex digits>
artefacts: <what was read, e.g. "VALIDATION.md s1,2,4,7-9; rotorgroup.js; rotor-group.mjs; VFS abstract">
data_pedigree: favourable | unfavourable
verification: favourable | unfavourable
validation: favourable | unfavourable
---
```

followed by free text: the opinion in the reviewer's own words, and findings. Findings are logged
as issues in the repository, not fixed silently; list the issue numbers here.

Level 2 on either factor requires a *formal* internal review under a process the organisation
established, and level 3 an independent one; neither is claimed by a record in this folder.
