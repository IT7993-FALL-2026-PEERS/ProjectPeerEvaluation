# Contribution Multiplier: grading proposal

**Status: proposal, not decided by the sponsor. Built as a selectable report method (CICD-81, at Khoa's request, Nov 4, 2026); curved stays the default.** The sponsor asked the team to research a "Contribution Multiplier" as a replacement for, or an addition to, curved grading, and to finalize it at the next capstone meeting. This is the team's position for that meeting (M4 Khoa Ho, Oct 30, 2026; the team grade changed on Nov 2 and again on Nov 4, see "Why the team grade is automatic and editable"). The cap, the floor and the way the team grade is set are the team's choices; the sponsor decides. The report today still uses the regular and the curved (mean 85, standard deviation 20) methods.

## Why

The sponsor's answer on Oct 30: curved grading overall, and a standard deviation of 20 in particular, is not serving the purpose, and a standard deviation of 10 would not be a good choice either. Two problems we found with the curve: a team of 2 to 4 can be forced apart even when everyone did well (a team of 4 rated 95, 94, 93, 92 can be curved to 100, 94, 76 and 58), and a student's grade depends on every other team in the class.

## The proposal

The team gets one grade for its work. The peer ratings do not decide how good the team is; they decide how that grade is **shared** inside the team. One rule for every team size.

1. **Team grade.** The app proposes one grade per team: the highest student score in the team (step 2). The instructor sees it and can replace it with their own grade for that team (0 to 100). A grade the instructor typed is marked as such and is kept until the instructor chooses "back to automatic".
2. **Student score** = the median of the ratings the student received from teammates. With two ratings this is their average; with one, that rating. A student's own rating of themselves is not used.
3. **Multiplier** = the student's score divided by the average score of the *other* teammates, never above **1.00**.
4. **Final grade** = the team grade times the multiplier. It is never above the team grade, and the multiplier never takes a student below **70** (a C: the report's scale is A from 90, B from 80, C from 70, D from 60) or, when the team grade itself is lower than 70, below the team grade.
5. **A team of one** has no peers, so the multiplier is 1.00 and the student gets the team grade (their own score, unless the instructor typed another); the instructor is told before the evaluation is sent (the sponsor's answer to the team-of-one question).
6. **A student with no ratings** shows as "no ratings" and is not guessed; the instructor decides. A team where nobody has a rating has no automatic grade, so the instructor enters one.
7. **Ratings that differ a lot** from the others a student received are flagged for the instructor, who sees every team grade, multiplier and the ratings behind it before anything is final. The report already flags all-fives ratings as a possible outlier (FR-20); the same check would flag very low ones.

## Why these choices

- **Median of the ratings received:** one angry rater cannot wreck a result in a team of 4 or more. If a weak student rates the three good ones 20, each good student's average rating falls from 95 to 70 (ratings 95, 95, 20) and the weak student's penalty nearly disappears; the median stays 95. A team of 3 has only two ratings per student, so there the median is the average and the report relies on the flag in step 7.
- **Compare with the average of the others:** the penalty should match the real gap. A student rated 60 next to three rated 95 did about 63 percent of what a teammate did. Comparing with the team average (which includes the student's own low score) gives a milder penalty; comparing with the others gives 63 percent.
- **Cap 1.00:** nobody gets more than the team grade; the strong students keep it and the others are scaled down.
- **Floor of 70 on the multiplier's effect:** the multiplier alone cannot take a student below a C. The team grade is still respected: it is never raised.

## Why the team grade is automatic and editable

The first version (Oct 30) set the team grade to the median of the team's own scores. Testing it on more teams (Nov 2) showed that it fails when the weak students are half the team or more: for a team scored 95, 60, 60, 60 every student, the strong one included, ended at 70, and for 95, 95, 60, 60 the strong two ended at 77.5. The median falls to the weak level, and the cap at 1.00 then stops anyone rising above it. A team grade the instructor types in does not have this problem (it is how Purdue and Cadmus do it), but it adds work for every team.

The current version (Nov 4) uses the **highest student score** as the automatic team grade. The strongest student then keeps their own score, the others are scaled from it, and the 1-strong-3-weak team works again (95, 60, 60, 60 gives 95, 79.5, 79.5, 79.5). The instructor can still replace the grade for any team.

The weakness is that one very high score sets the bar for the whole team: for a team scored 99, 80, 80, 80 the three 80s each get 91.7. That is the case the edit is for. The instructor sees the grade before it is final, and typing 85 for that team gives 85, 78.8, 78.8, 78.8.

## Worked examples

Peer scores of the team members, the automatic team grade (the highest score), and the final grades (cap 1.00, floor 70 on the multiplier).

| Team scores | Team grade | Final grades |
|---|---|---|
| 95, 95, 95, 60 (3 strong, 1 weak) | 95 | 95, 95, 95, **70** |
| 95, 60, 60, 60 (1 strong, 3 weak) | 95 | **95**, 79.5, 79.5, 79.5 |
| 95, 95, 60, 60 (2 strong, 2 weak) | 95 | 95, 95, **70**, **70** |
| 95, 94, 93, 92 (all strong) | 95 | 95, 95, 94.3, 93.0 |
| 95, 94, 93, 70 (one weak) | 95 | 95, 95, 95, 70.7 |
| 95, 95, 95, 95, 50 (team of 5, one weak) | 95 | 95 ×4, **70** |
| 90, 88 (team of 2) | 90 | 90, 88 |
| 60, 60, 60, 60 | 60 | 60 each (the team grade is not raised) |
| 99, 80, 80, 80 (one very high score) | 99 | 99, 91.7, 91.7, 91.7 |
| 99, 80, 80, 80, instructor enters 85 | 85 | 85, 78.8, 78.8, 78.8 |

For comparison, the curve turns 95, 94, 93, 92 into 100, 94, 76 and 58 when the team is the whole class, and the result for a real class depends on every other team.

## Side effects (to tell the sponsor)

- The app needed a place to show each team's grade, let the instructor edit it and remember that it was typed by hand. That is the Team Grades panel of the report (CICD-81); the grade is stored on the team (`Team.team_grade`, `null` = automatic).
- Nobody ends above the best score in the team, so a strong student gets no bonus for carrying the team.
- One very high score lifts the whole team (the 99, 80, 80, 80 row). The instructor's edit is the remedy; without it the three 80s receive 91.7.
- The floor of 70 means a student who contributed far less (60 against 95) still gets a C when the team grade is high. A floor on the multiplier alone is the alternative; without any floor the same student would get 60.0 in the first example.
- A team of 2 has one rating each way and no moderation.
- A team where everyone is rated low gets a low team grade (the 60, 60, 60, 60 row), because the grade comes from the ratings. An instructor who knows the work was good can type a higher one.

## What the sponsor decides at the meeting

| Decision | The team's proposal | Other option |
|---|---|---|
| Team grade | Automatic from the highest student score; the instructor can replace it per team | Always entered by the instructor, a fixed 100, the team average, or the higher of the team's mean and median (the median and that rule both fail the 1-strong-3-weak case above: 95, 60, 60, 60 gives 68.8 to everyone; their advantage is that one very high score does not lift the team) |
| Cap on the multiplier | 1.00 | 1.05, a small bonus for the strongest students |
| Floor | The multiplier never takes a student below 70 | The team grade minus 10 to 15 points, or no floor |
| Curved grading | Keep the regular and the curved methods selectable until the sponsor decides | Remove the curve |

After the meeting: write the agreed formula down here and change what the sponsor decides differently. The report method exists already (CICD-81): the cap, the floor and the way the automatic grade is chosen are constants in `src/backend/utils/contributionMultiplier.js`, and the regular and curved methods stay selectable (curved is the default) until the sponsor decides.

## How other courses do it

There is no single standard formula; caps, floors, rounds and self ratings are each a choice. Three descriptions we read in full:

- [Purdue CS 307, "Team Member Contributions"](https://www.cs.purdue.edu/homes/bxd/307/multipliers.html): each rater splits a fixed pool of points among teammates; the multiplier is the points received divided by the pool, averaged over rounds; the project score is the multiplier times the team's points. No cap is stated, raters do not rate themselves.
- [Cadmus, "Peer evaluation as a group score multiplier"](https://support.cadmus.io/setting-up-peer-evaluation-as-a-group-score-multiplier): multiplier = the square root of (student score divided by the group average), kept between a minimum and 1.00; a student who did not complete the evaluation gets the minimum; a group of one gets 1.00.
- [McGill, "Grading peer assessment"](https://teachingkb.mcgill.ca/tlk/grading-peer-assessment): the team grade times the student's average rating divided by the team average; it suggests keeping the peer share small (5 to 25 percent of an assignment) and capping the factor (a maximum of 1.05 and a minimum of 0.95 are mentioned).

WebPA and the LAMS self and peer assessment guide describe the same idea (each student's average rating divided by the team's average). We read summaries of those, not the full pages, and a summary of CATME's adjusted factor scores; check them before quoting them to anyone.
