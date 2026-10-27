# Student Guide

(Instructions for students.)

## Quick Start with the API

Set the API base URL, then register an administrator account for test data. Registration is limited to
instructor email addresses (`@kennesaw.edu` unless `ALLOWED_EMAIL_DOMAINS` says otherwise; for local testing
set it to your own domain, for example `example.edu`), and **no password is sent**: the account owner chooses it
from a link emailed to the address. Mail has to work for this (Mailtrap's sandbox is enough). In
development the link is also printed in the backend log.

```bash
API_URL=https://projectpeerevaluation.onrender.com/api

curl -X POST "$API_URL/auth/register" \
	-H "Content-Type: application/json" \
	-d '{
		"email": "admin@kennesaw.edu",
		"name": "Test Administrator",
		"department": "Computer Science"
	}'
```

Open the emailed link (it ends in `/verify-email/<token>`), or send the token and a password yourself:

```bash
curl -X POST "$API_URL/auth/verify-email" \
	-H "Content-Type: application/json" \
	-d '{
		"token": "TOKEN_FROM_THE_EMAIL",
		"password": "admin-password"
	}'
```

Log in and copy the returned `access_token` into `TOKEN`. An account that has not confirmed its email
cannot log in (403 `EMAIL_NOT_VERIFIED`):

```bash
curl -X POST "$API_URL/auth/login" \
	-H "Content-Type: application/json" \
	-d '{
		"email": "admin@kennesaw.edu",
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
			{ "team_name": "Team 1" },
			{ "team_name": "Team 2" }
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
		"group_assignment": "Team 1"
	}'

curl -X POST "$API_URL/courses/$COURSE_ID/students" \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"student_id": "S1002",
		"name": "Jordan Lee",
		"email": "jordan.lee@example.com",
		"group_assignment": "Team 2"
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
