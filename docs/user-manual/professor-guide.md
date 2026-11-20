# Professor Guide

How an instructor uses PEERS to collect peer evaluations, follow them up and turn them into grades. The
workflows behind each step, and the tests that cover them, are in
[`critical-workflows.md`](../requirements/critical-workflows.md). To run the app yourself, see the README
("Getting Started").

## 1. Sign in

- **Register** with your `@kennesaw.edu` address. You choose your password from the link in the confirmation email;
  an account that has not confirmed its email cannot log in. If you forget your password, use the reset link on
  the login page.
- **Session.** You stay signed in while you work. After 60 minutes without activity (or 8 hours after you signed in)
  the session ends. A warning appears 5 minutes before, with a "Stay logged in" button. If it ends, a Log in dialog
  signs you back in on the same page, so what you typed in an open form is kept.

## 2. Set up a course

1. Create the course (name, number, section, semester).
2. **Upload the roster** as a CSV file ([format](../csv-upload-format.md)) or add students by hand. A file that is not
   valid is refused and your existing data is kept. Uploading a roster again keeps the evaluations already
   submitted.
3. **Teams.** Teams are named Team 1, Team 2, and so on (another name is refused). Students are placed on them by
   the roster's group column or by hand. A team is optional: a student with no team is not sent an evaluation, because there is nobody to rate. A student alone on
   a team is not sent one either.

## 3. Send the evaluations

1. Choose the evaluation deadline. It is required, and each student's link stops working at the deadline.
2. Before anything is sent, the app tells you which students it cannot reach (no team, alone on a team).
3. Send. The dialog says how many invitations are going out and about how long it takes. Each student gets an email
   with a personal link; nobody logs in. On staging every email goes to a test inbox, never to a real student.

## 4. Follow up

- The **Evaluation Status** dialog (on the course row) shows who has submitted. Send a **reminder** to those who have
  not; a reminder never extends the deadline.
- To give students more time, **extend** the deadline: this issues new links and ends the old ones. To let one
  student submit again, approve a **resubmission**: the new answers replace the earlier ones.

## 5. Reports and grades

Open the course report and choose a grading method:

| Method | What it does |
|---|---|
| Regular | The student's mean score from the ratings received. |
| Curved (the default) | The class is rescaled to a target mean of 85 and a standard deviation of 20 (at most 100). |
| Contribution Multiplier | Each team gets one grade, by default its highest student score. The peer ratings decide how that grade is shared: a student's multiplier is their score divided by the average of the others, never above 1. The final grade is rounded to the nearest 5. |

With the Contribution Multiplier:

- The **Team Grades** panel shows each team's grade and lets you type your own; **Use automatic grade** returns to the
  automatic one.
- A student whose multiplier takes the grade below 70 is marked **Review**. There is no floor: the grade is what the
  formula gives, and you decide what to do.
- Use **Edit** on any row to set a student's final score yourself. The row then shows Adjusted, and **Use calculated
  grade** undoes it.
- **Download CSV** gives the same numbers, including the flag, the calculated score and where the final score came
  from.
- **Reset Evaluation State** (in the Evaluation Status dialog) also clears typed final scores and team grades.

## 6. When something looks wrong

- A student says the link does not work: check the deadline and whether the link was replaced by an extension.
- The "Session timed out" banner: log in again from the dialog.
- Anything else: [Troubleshooting for the pipeline and staging](../operations/ci-cd-operations.md) and the
  [runbook](../operations/README.md).
