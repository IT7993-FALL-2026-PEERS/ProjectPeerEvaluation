// Turns a send/remind response into an alert. The backend lists each failure as
// "Name (email): reason"; only the names are shown to the professor.
export function describeEmailResult({ sent = 0, total = 0, failed = [] }, successMessage) {
  if (!failed || failed.length === 0) {
    return { severity: 'success', message: successMessage };
  }
  const names = failed.map((entry) => entry.split(' (')[0]).join(', ');
  if (sent === 0) {
    return { severity: 'error', message: `No emails were sent. Not sent to: ${names}.` };
  }
  return { severity: 'warning', message: `Sent ${sent} of ${total} emails. Not sent to: ${names}.` };
}
