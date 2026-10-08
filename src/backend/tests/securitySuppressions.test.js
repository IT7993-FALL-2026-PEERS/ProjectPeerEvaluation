const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The OWASP Dependency-Check job fails on any finding with CVSS 7 or higher unless it is
// listed in .github/dependency-check-suppressions.xml (CICD-24). An accepted risk has to be
// narrow and on the record, or the gate quietly stops meaning anything. These tests keep the
// register honest: each suppression names one advisory for one exact package version, has an
// expiry date and a reason, and is written up in docs/security/security-policy.md.
const root = path.join(__dirname, '..', '..', '..');
const xml = fs.readFileSync(path.join(root, '.github', 'dependency-check-suppressions.xml'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'docs', 'security', 'security-policy.md'), 'utf8');

const blocks = [...xml.matchAll(/<suppress\b([^>]*)>([\s\S]*?)<\/suppress>/g)].map((m) => ({ attrs: m[1], body: m[2] }));

// The register may be empty (it is, since the frontend left Create React App); then the tests below have
// nothing to check and start checking again as soon as an entry is added.
test('TC-SEC-01: the suppression file is well formed', () => {
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<suppressions xmlns="https:\/\/jeremylong\.github\.io\/DependencyCheck\/dependency-suppression\.1\.3\.xsd">/);
  assert.equal((xml.match(/<suppress\b/g) || []).length, (xml.match(/<\/suppress>/g) || []).length, 'unbalanced <suppress> tags');
});

test('TC-SEC-02: every suppression expires, so it has to be reviewed again', () => {
  for (const { attrs, body } of blocks) {
    assert.match(attrs, /\buntil="\d{4}-\d{2}-\d{2}Z"/, `missing until in: ${body.slice(0, 80)}`);
  }
});

// Advance notice: this fails 14 days before the earliest expiry, so the review happens while CI is still
// green, instead of every pull request turning red on the day a suppression lapses.
test('TC-SEC-04: no suppression expires within 14 days; re-triage and extend it before then', () => {
  const WARNING_DAYS = 14;
  for (const { attrs } of blocks) {
    const until = /\buntil="(\d{4}-\d{2}-\d{2})Z"/.exec(attrs)[1];
    const daysLeft = Math.floor((new Date(`${until}T00:00:00Z`).getTime() - Date.now()) / 86400000);
    assert.ok(
      daysLeft > WARNING_DAYS,
      `a suppression expires on ${until} (${daysLeft} days): re-triage it and extend the date (docs/security/security-policy.md)`
    );
  }
});

test('TC-SEC-03: every suppression says why, in the notes', () => {
  for (const { body } of blocks) {
    const notes = /<notes><!\[CDATA\[([\s\S]*?)\]\]><\/notes>/.exec(body);
    assert.ok(notes && notes[1].trim().length >= 40, `notes missing or too short in: ${body.slice(0, 80)}`);
  }
});

test('TC-SEC-04: a suppression covers one advisory of one exact package version, never a package or a pattern', () => {
  for (const { body } of blocks) {
    const purl = /<packageUrl regex="true">(\^pkg:npm\/[^<]+\$)<\/packageUrl>/.exec(body);
    assert.ok(purl, `packageUrl must be an anchored regular expression: ${body.slice(0, 100)}`);
    assert.match(purl[1], /^\^pkg:npm\/[a-z0-9@%.\\_-]+@\d+\\\.\d+\\\.\d+\$$/i, `version must be exact: ${purl[1]}`);
    assert.doesNotMatch(purl[1], /\.\*|\.\+|\[|\(|\|/, `no wildcards: ${purl[1]}`);
    assert.match(body, /<vulnerabilityName>GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}<\/vulnerabilityName>/, 'one named advisory');
    assert.equal((body.match(/<vulnerabilityName>/g) || []).length, 1, 'one advisory per suppression');
    assert.doesNotMatch(body, /<cpe\b|<filePath\b|<sha1\b/, 'no broader matchers');
  }
});

test('TC-SEC-05: every suppressed advisory is written up in the security policy with its package', () => {
  for (const { body } of blocks) {
    const advisory = /<vulnerabilityName>(GHSA-[^<]+)<\/vulnerabilityName>/.exec(body)[1];
    const purl = /\^pkg:npm\/([^@]+)@/.exec(body)[1];
    assert.ok(policy.includes(advisory), `${advisory} is suppressed but not in docs/security/security-policy.md`);
    assert.ok(policy.includes(purl), `${purl} is suppressed but not in docs/security/security-policy.md`);
  }
});

test('TC-SEC-06: the security job blocks on CVSS 7 and uses this suppression file', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'security.yml'), 'utf8');
  assert.match(workflow, /--failOnCVSS 7\b/);
  assert.match(workflow, /--suppression \.github\/dependency-check-suppressions\.xml/);
});
