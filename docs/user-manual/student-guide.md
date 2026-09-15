# Student Guide

(Instructions for students.)

## Quick Start with the API

Set the API base URL, then register an administrator account for test data:

```bash
API_URL=https://projectpeerevaluation.onrender.com/api

curl -X POST "$API_URL/auth/register" \
	-H "Content-Type: application/json" \
	-d '{
		"email": "admin@example.com",
		"password": "admin-password",
		"name": "Test Administrator",
		"department": "Computer Science"
	}'
```

Log in and copy the returned `access_token` into `TOKEN`:

```bash
curl -X POST "$API_URL/auth/login" \
	-H "Content-Type: application/json" \
	-d '{
		"email": "admin@example.com",
		"password": "admin-password"
	}'

TOKEN="YOUR_ACCESS_TOKEN"
```

Create a test course and save its returned `id` as `COURSE_ID`:

```bash
curl -X POST "$API_URL/courses" \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"course_name": "Software Engineering",
		"course_number": "CS 401",
		"course_section": "001",
		"semester": "Fall 2026"
	}'

COURSE_ID="ID_FROM_CREATE_COURSE_RESPONSE"
```

Populate the course with teams:

```bash
curl -X POST "$API_URL/courses/$COURSE_ID/teams" \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"teams": [
			{ "team_name": "Team Alpha" },
			{ "team_name": "Team Beta" }
		]
	}'
```

Add test students. Supplying `group_assignment` assigns each student to the matching team:

```bash
curl -X POST "$API_URL/courses/$COURSE_ID/students" \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"student_id": "S1001",
		"name": "Alex Smith",
		"email": "alex.smith@example.com",
		"group_assignment": "Team Alpha"
	}'

curl -X POST "$API_URL/courses/$COURSE_ID/students" \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"student_id": "S1002",
		"name": "Jordan Lee",
		"email": "jordan.lee@example.com",
		"group_assignment": "Team Beta"
	}'
```

List the populated values to confirm the test data was created:

```bash
# List courses for the authenticated administrator
curl "$API_URL/courses" \
	-H "Authorization: Bearer $TOKEN"

# Get the created course, including its student count
curl "$API_URL/courses/$COURSE_ID" \
	-H "Authorization: Bearer $TOKEN"

# List teams in the created course
curl "$API_URL/courses/$COURSE_ID/teams" \
	-H "Authorization: Bearer $TOKEN"

# List students in the created course
curl "$API_URL/courses/$COURSE_ID/students" \
	-H "Authorization: Bearer $TOKEN"
```
