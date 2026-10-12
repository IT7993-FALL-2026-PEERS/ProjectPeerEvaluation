# CSV Upload Format for Student Roster

## Required Columns

When uploading a CSV file to add students to a course, the file must contain the following columns:

### Required Fields
- **student_id** - Unique student identifier (required)
- **name** - Full name of the student (required)  
- **email** - Student's email address (required)

### Optional Fields
- **group_assignment** - Group name or identifier for team assignments (optional)
  - Alternative column name: **group** (either name will work)

## Sample CSV Format

```csv
student_id,name,email,group_assignment
ST001,John Doe,john.doe@university.edu,Group A
ST002,Jane Smith,jane.smith@university.edu,Group B
ST003,Bob Johnson,bob.johnson@university.edu,Group A
ST004,Alice Brown,alice.brown@university.edu,
```

## Important Notes

1. **File Format**: Only CSV files (.csv) are accepted
2. **Headers**: The first row must contain column headers
3. **Required Fields**: student_id, name, and email are mandatory
4. **Duplicates**: Students with existing student_ids in the course will be skipped
5. **Group Assignment**: This field is optional and can be left empty
6. **Email Format**: Each email must have the form `name@domain.tld`: one `@`, text before it, and a domain with a dot in it (for example `jane.smith@university.edu`), with no spaces inside the address. A row whose email does not match, such as `bob@`, `bob` or `bob@x`, is reported as an error and that student is not added. Only the form is checked: the system does not check that the address exists or can receive mail. Adding or editing a student by hand uses the same check.
7. **Encoding**: UTF-8 encoding is recommended

## Error Handling

A file with no usable rows (empty, header only, wrong column names, or every row missing a
required field or having a badly formed email) is rejected with an error, and nothing on the
course is changed. If only some rows have problems, those rows are reported and the rest are added.

The system will provide feedback on:
- Missing required columns
- Invalid file format
- Duplicate student IDs
- Malformed data rows
- Badly formed email addresses (the row is skipped)
- Processing errors

## Column Flexibility

The system accepts these column name variations:
- `group_assignment` or `group` for group assignments
- Column names are case-sensitive
- Extra columns will be ignored

## Upload Process

1. Click "Upload CSV" in the Manage Students dialog
2. Select your CSV file
3. Review the upload requirements
4. Click "Upload" to process the file
5. Check the results for any errors or warnings