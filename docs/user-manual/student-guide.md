# Student Guide

How to give your teammates peer feedback in PEERS.

## 1. Open your link

Your instructor sends you an email with a personal link. Open it in your browser; you do not log in or create an
account. The link is yours: do not share it. It stops working at the deadline your instructor set, so submit before
then.

## 2. Rate each teammate

For every teammate, give a rating from 1 to 5 on each of the six criteria: professionalism, communication, work
ethic, content knowledge and skills, overall contribution, and participation. Each level has a short description on
the form.

## 3. Write your feedback

Write feedback for each teammate: at least 50 and at most 500 characters. The form shows a running count and will
not send until the length is right. Be specific and fair; your instructor reads it.

## 4. Submit once

Submit when you are done. A submission is final: a second one with the same link is refused. If you made a mistake,
ask your instructor, who can approve one resubmission, which replaces your earlier answers.

## 5. If something goes wrong

- The link says it has expired: the deadline has passed, or your instructor sent a new link. Ask your instructor.
- You did not get an email: look in your spam folder, then ask your instructor to check your address.

# For testers: API quick start

This part is for people who test the API directly, against their own local backend (`npm run dev`). It is not needed to
submit an evaluation. Do not use it against the staging site: staging is shared, and its email allowance is needed for demonstrations.

## Quick Start with the API

Set the API base URL, then register an administrator account for test data. Registration is limited to
instructor email addresses (`@kennesaw.edu` unless `ALLOWED_EMAIL_DOMAINS` says otherwise; for local testing
set it to your own domain, for example `example.edu`), and **no password is sent**: the account owner chooses it
from a link emailed to the address. Mail has to work for this (Mailtrap's sandbox is enough). In
development the link is also printed in the backend log.

```bash
API_URL=http://localhost:5000/api

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
