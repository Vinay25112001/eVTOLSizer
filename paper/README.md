# Publication

## Target: VFS Forum 83, Aircraft Design technical committee

The Vertical Flight Society's 83rd Annual Forum & Technology Display,
**11–13 May 2027, Phoenix, Arizona.**

| milestone | date | status |
|---|---|---|
| **Abstract due** | **9 October 2026** | draft in `VFS-Forum-83-abstract.md` |
| Final paper due | early April 2027 (Forum 82's was 3 April) | not started |
| Present in person | 11–13 May 2027 | travel not yet arranged |

### Why this venue

The people who produced the weight statements this tool is validated against —
NDARC, the NASA UAM concept vehicles, Johnson & Silva — publish here. The
Aircraft Design committee explicitly seeks "conceptual and detail design of
vehicle, airframe, dynamic components, and major subsystems, and trade-off
analysis as part of the design process". Research note 25 has the full venue
analysis, including the Systems Engineering committee as a fallback if the paper
is reframed around the credibility assessment rather than the sizing physics.

### Submission facts that constrain the work

- **The abstract is 3–5 pages, minimum three** — not 250 words. The current
  draft is ~1,700 words plus a table and one figure to be generated.
- Acceptance is judged on technical quality, relevance, originality, research
  value and **completion status**, which is why the draft has an explicit
  completion-status section separating what is measured now from what is not.
- **"No Paper, No Podium" and "No Podium, No Paper."** Submitting is a
  commitment to write the paper and attend in person. There is no virtual
  option. Do not submit until the travel is real.
- Final papers receive a DOI and are published.
- Authors may present at most two papers.

### On the words "peer reviewed"

Forum abstracts are reviewed and selected by the technical committees and final
papers are published with a DOI. That is peer review in the conference sense.
**It is not archival journal peer review, and the paper must not claim it is.**
The archival step is the *Journal of the American Helicopter Society*, for an
extended version after the Forum paper exists.

## Every number in the draft is gated

`npm run paper` (also part of `npm test`) measures all 18 numeric claims in this
directory directly from the harnesses and fails if any one of them is no longer
reproduced. The paper argues that published accuracy figures drift away from the
code that produced them; a draft containing a stale number would refute its own
thesis. Verified in both directions: altering a single figure in the draft fails
the gate and names the claim.

## Before submitting

- [x] Author name on the draft — Vinay Kumar Reddy Sirigireddy
- [x] Contact address — the Wright State one, in both the draft and
      CITATION.cff. Worth revisiting the CITATION.cff entry if you ever leave
      the university, since a citation record outlives the account it names.
- [ ] Any co-authors or advisor to add
- [ ] Confirm Wright State travel support for Phoenix, May 2027
- [ ] Generate the per-group error figure named in §2
- [ ] Extend the loop-level comparison from 3 concept vehicles to all 8
- [ ] Convert to the VFS abstract template (Word; LaTeX "coming soon")
- [ ] Register on the Mira submission portal
