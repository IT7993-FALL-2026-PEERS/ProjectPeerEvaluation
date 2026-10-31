# Contribution Multiplier: grading proposal

**Status: proposal, not decided, not built.** The sponsor asked the team to research a "Contribution Multiplier" as a replacement for, or an addition to, curved grading, and to finalize it at the next capstone meeting. This is the team's position for that meeting (M4 Khoa Ho, Oct 30, 2026). The cap, the floor and the automatic base below are the team's choices; the sponsor decides. The report today still uses the regular and the curved (mean 85, standard deviation 20) methods.

## Why

The sponsor's answer on Oct 30: curved grading overall, and a standard deviation of 20 in particular, is not serving the purpose, and a standard deviation of 10 would not be a good choice either. Two problems we found with the curve: a team of 2 to 4 can be forced apart even when everyone did well (a team of 4 rated 95, 94, 93, 92 can be curved to 100, 94, 76 and 58), and a student's grade depends on every other team in the class.

## The proposal

One rule for every team size.

1. **Student score** = the median of the ratings the student received from teammates. With two ratings this is their average; with one, that rating. A student's own rating of themselves is not used.
2. **Multiplier** = the student's score divided by the average score of the *other* teammates, never above **1.00**.
3. **Final grade** = the team's base score times the multiplier, never above 100 and never below **70** (a C: the report's scale is A from 90, B from 80, C from 70, D from 60).
4. **The team's base score is automatic**: the median of the team's student scores from step 1. No instructor entry.
5. **A team of one** has no peers, so the multiplier is 1.00, and the instructor is told before the evaluation is sent (the sponsor's answer to the team-of-one question).
6. **A student with no ratings** shows as "no ratings"; the floor of 70 is not applied to them automatically, because that is the instructor's decision.
7. **Ratings that differ a lot** from the others a student received are flagged for the instructor, who sees every multiplier and the ratings behind it before anything is final. The report already flags all-fives ratings as a possible outlier (FR-20); the same check would flag very low ones.

## Why these choices

- **Median of the ratings received:** one angry rater cannot wreck a result in a team of 4 or more. If a weak student rates the three good ones 20, each good student's average rating falls from 95 to 70 (ratings 95, 95, 20) and the weak student's penalty nearly disappears; the median stays 95. A team of 3 has only two ratings per student, so there the median is the average and the report relies on the flag in step 7.
- **Compare with the average of the others:** the penalty should match the real gap. A student rated 60 next to three rated 95 did about 63 percent of what a teammate did. Comparing with the team average (which includes the student's own low score) gives a milder penalty; comparing with the others gives 63 percent.
- **Cap 1.00:** the good students keep the team's grade; nobody gets more than the team.
- **Median as the base:** the three good students keep their own level when one student scores low, and a team that only ever rated itself weakly stays weak (before the floor).
- **Floor of 70:** every student who has ratings gets at least a C.

## Worked examples

Peer scores of the team members, and the final grades (cap 1.00, floor 70, base = median of the team's scores).

| Team scores | Final grades |
|---|---|
| 95, 95, 95, 60 (3 good students, 1 weak) | 95, 95, 95, **70** |
| 95, 94, 93, 92 (all strong) | 93.5, 93.5, 92.8, 91.5 |
| 95, 94, 93, 70 (one weak) | 93.5, 93.5, 93.5, **70** |
| 60, 60, 60, 60 (all weak) | **70** each |
| 90, 88 (team of 2) | 89, 87 |
| 76.67 x 4 (identical) | 76.7 each |

For comparison, the curve turns 95, 94, 93, 92 into 100, 94, 76 and 58 when the team is the whole class, and the result for a real class depends on every other team.

## Side effects (to tell the sponsor)

- Nobody ends above the team's median score, so in a strong team the top student can end slightly below their own score (95 becomes 93.5).
- The floor of 70 means a student who contributed far less (60 against 95) still gets a C, which limits how much the multiplier can penalize. A floor on the multiplier (for example 0.70) is the alternative; it would give the weak student 66.5 in the first example.
- A team's grade depends only on its own members' ratings, so a team of generous raters scores higher than a team of strict ones.

## What the sponsor decides at the meeting

| Decision | The team's proposal | Other option |
|---|---|---|
| Cap on the multiplier | 1.00 | 1.05, a small bonus for the strongest students |
| Floor | Final grade never below 70 (a C) | No floor, or a floor on the multiplier (for example 0.70) |
| Team base | Automatic: the median of the team's student scores | The instructor enters one grade per team, the team average, or a fixed 100 |
| Curved grading | Keep the regular and the curved methods selectable until she decides | Remove the curve |

After the meeting: write the agreed formula down here and make one backlog task for it. Nothing in the application changes until then.

## How other courses do it

There is no single standard formula; caps, floors, rounds and self ratings are each a choice. Two descriptions we read in full:

- [Purdue CS 307, "Team Member Contributions"](https://www.cs.purdue.edu/homes/bxd/307/multipliers.html): each rater splits a fixed pool of points among teammates; the multiplier is the points received divided by the pool, averaged over rounds; the project score is the multiplier times the team's points. No cap is stated, raters do not rate themselves.
- [Cadmus, "Peer evaluation as a group score multiplier"](https://support.cadmus.io/setting-up-peer-evaluation-as-a-group-score-multiplier): multiplier = the square root of (student score divided by the group average), kept between a minimum and 1.00; a student who did not complete the evaluation gets the minimum; a group of one gets 1.00.

WebPA and the LAMS self and peer assessment guide describe the same idea (each student's average rating divided by the team's average). We read summaries of those, not the full pages, and a summary of CATME's adjusted factor scores; check them before quoting them to anyone.
