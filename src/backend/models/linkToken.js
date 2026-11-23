// An evaluation link token opens a student's form and submits ratings in their name until the deadline,
// so it never leaves the backend except in the student's own email (CICD-94). The frontend never reads it.
//
// hideLinkToken(schema): a document sent with res.json() (a student, an evaluation, or an array of them)
// goes out without the token. Only toJSON is changed: toObject() keeps it, because the backend copies
// evaluations with new Evaluation(evaluation.toObject()) and the token is required there.
//
// withoutLinkToken(record): the same for a plain object built from toObject(), e.g. a report row.
function withoutLinkToken(record) {
  const copy = { ...record };
  delete copy.evaluation_token;
  return copy;
}

function hideLinkToken(schema) {
  schema.set('toJSON', {
    transform: (_doc, ret) => {
      delete ret.evaluation_token;
      return ret;
    },
  });
}

module.exports = { hideLinkToken, withoutLinkToken };
