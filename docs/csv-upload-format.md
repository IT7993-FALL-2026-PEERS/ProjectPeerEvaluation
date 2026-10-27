# CSV Upload Format for Student Roster

This page is the same guide the professor sees at the top of both roster upload dialogs
(Manage Students → Upload CSV, and Upload Student Roster on the course row).

## Required Columns

When uploading a CSV file to add students to a course, the first row must be the header and
the file must contain these columns:

### Required Fields
- **student_id** - Unique student identifier (required on every row)
- **name** - Full name of the student (required)
- **email** - Student's email address (required)

### Optional Fields
- **team_name** - The student's team (optional). Teams are numbered, see "Team names" below.
  - Alternative column names: **group_assignment** or **group** (any of the three works)

## Team names

Teams are named **Team 1, Team 2, Team 3, ...**, the word Team and a number. The same team
can be written in a few ways and is always stored as `Team N`:

| In the file | Stored as |
|---|---|
| `Team 3`, `team 3`, `TEAM 3`, `Team3`, `Team 03` | `Team 3` |
| `3`, `03` (just the number) | `Team 3` |
| `Alpha`, `Team A`, `Team 0`, `Team 1 2`, `3rd` | not accepted |

A row with a team name that is not numbered is **skipped and reported** (the message names the
student and the team, and repeats the rule); the other rows are still added. A file where
no row is usable is rejected and nothing on the course is changed. Leave the column empty
for a student who has no team yet.

The same rule applies everywhere a team is named: the Create Team and Edit Team dialogs, the
Add Student and Edit Student dialogs, and the API. A team named before this rule (for example
`Alpha`) keeps its name and can still be edited, as long as its name is left alone; renaming
it takes a numbered name.

## Sample CSV Format

```csv
student_id,name,email,team_name
1001,Ann Archer,ann@university.edu,Team 1
1002,Ben Baker,ben@university.edu,Team 1
1003,Cy Cole,cy@university.edu,Team 2
1004,Di Diaz,di@university.edu,
```

## Important Notes

1. **File Format**: Only CSV files (.csv) are accepted
2. **Headers**: The first row must contain column headers
3. **Required Fields**: student_id, name, and email are mandatory on every row.4. **Duplicates**: Students with existing student_ids in the course are updated, not added twice; a student_id that appears twice in the file is added once (the first row) and reported
5. **Team**: This field is optional and can be left empty; when given it must be a numbered team name (see above)
6. **Email Format**: Each email must have the form `name@domain.tld`: one `@`, text before it, and a domain with a dot in it (for example `jane.smith@university.edu`), with no spaces inside the address. A row whose email does not match, such as `bob@`, `bob` or `bob@x`, is reported as an error and that student is not added. Only the form is checked: the system does not check that the address exists or can receive mail. Adding or editing a student by hand uses the same check.
7. **Encoding**: UTF-8 encoding is recommended

## Error Handling

A file with no usable rows (empty, header only, wrong column names, or every row missing a
required field, having a badly formed email, or naming a team that is not numbered) is rejected
with an error, and nothing on the course is changed. If only some rows have problems, those rows
are reported and the rest are added.

The system will provide feedback on:
- Missing required columns
- Invalid file format
- Duplicate student IDs
- Malformed data rows
- Badly formed email addresses (the row is skipped)
- Team names that are not numbered (the row is skipped)
- Processing errors

## Column Flexibility

The system accepts these column name variations:
- `team_name`, `group_assignment` or `group` for the team
- Column names are case-sensitive
- Extra columns will be ignored

## Upload Process

1. Click "Upload CSV" in the Manage Students dialog
2. Read the format guide at the top of the dialog and select your CSV file
3. Click "Upload" to process the file
4. Check the results for any errors or warnings
