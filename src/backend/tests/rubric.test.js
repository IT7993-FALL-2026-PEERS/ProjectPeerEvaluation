const test = require('node:test');
const assert = require('node:assert/strict');
const rubric = require('../config/rubric');

// The fixed rubric (FR-13): all six criteria are rated 1-5, participation included (D-19, fixed 17 Oct 2026).
// The wording below is the sponsor's rubric sheet of 19 Oct 2026 (CICD-74), typed from a screenshot of the sheet.
const byId = (id) => rubric.criteria.find((criterion) => criterion.id === id);

test('TC-13-21: every criterion has five levels, 1 to 5, and the ids that scoring relies on are unchanged', () => {
  assert.deepEqual(
    rubric.criteria.map((criterion) => criterion.id),
    ['professionalism', 'communication', 'work_ethic', 'content_knowledge_skills', 'overall_contribution', 'participation'],
  );
  for (const criterion of rubric.criteria) {
    assert.equal(criterion.scale, '1-5', criterion.id);
    assert.equal(criterion.required, true, criterion.id);
    assert.deepEqual(Object.keys(criterion.scaleDescriptions).map(Number).sort(), [1, 2, 3, 4, 5], criterion.id);
  }
});

test('TC-13-22: the participation levels use the sponsor\'s wording', () => {
  assert.deepEqual(byId('participation').scaleDescriptions, {
    5: 'They participated fully and exceeded expectations.',
    4: 'They participated fully.',
    3: 'They participated to a moderate extent.',
    2: 'They participated to a limited extent / rarely.',
    1: 'They did not participate or hindered the group.',
  });
  assert.equal(byId('participation').description, 'Rate how your team members participated.');
});

test('TC-13-23: professionalism, communication and work ethic use the sponsor\'s wording', () => {
  const professionalism = byId('professionalism');
  assert.equal(professionalism.name, 'Professionalism');
  assert.equal(
    professionalism.description,
    'How well did each team member maintain the appropriate level of professionalism throughout the project? '
      + 'Behaviors to consider: shows respect towards team members, arrives to meetings on time, meets deadlines, uses applicable technology, etc.',
  );
  assert.deepEqual(professionalism.scaleDescriptions, {
    5: 'This team member acted in a professional way at all times.',
    4: 'This team member acted in a professional way most of the time.',
    3: 'This team member acted in a professional way some of the time.',
    2: 'This team member rarely acted in a professional way.',
    1: 'This team member never acted in a professional way.',
  });

  const communication = byId('communication');
  assert.equal(communication.name, 'Communication');
  assert.equal(
    communication.description,
    'How well did each team member communicate in the appropriate manner for this project? '
      + 'Behaviors to consider: uses academic dialogue, listens to other team members, offers and accepts feedback constructively, '
      + 'facilitates positive interactions among team members, etc.',
  );
  assert.deepEqual(communication.scaleDescriptions, {
    5: 'This team member communicated appropriately at all times.',
    4: 'This team member communicated appropriately most of the time.',
    3: 'This team member communicated appropriately some of the time.',
    2: 'This team member rarely communicated appropriately.',
    1: 'This team member never communicated appropriately.',
  });

  const workEthic = byId('work_ethic');
  assert.equal(workEthic.name, 'Work Ethic');
  assert.equal(
    workEthic.description,
    'Was the team member dedicated to completing the amount of work necessary to achieve the goals of the group?',
  );
  assert.deepEqual(workEthic.scaleDescriptions, {
    5: 'This team member’s work ethic was excellent.',
    4: 'This team member’s work ethic was above average.',
    3: 'This team member’s work ethic was average.',
    2: 'This team member’s work ethic was slightly below average.',
    1: 'This team member’s work ethic was far below average.',
  });
});

test('TC-13-24: content knowledge, overall contribution and the written feedback use the sponsor\'s wording', () => {
  const knowledge = byId('content_knowledge_skills');
  assert.equal(knowledge.name, 'Content Knowledge and Skills');
  assert.equal(
    knowledge.description,
    'Did the team member have or acquire the knowledge and skills necessary to contribute to the successful completion of the project? '
      + 'Behaviors to consider: understands common vocabulary, completes background readings or research, '
      + 'knows how to use necessary equipment or technology, has ability to fill multiple roles within the group, etc.',
  );
  assert.deepEqual(knowledge.scaleDescriptions, {
    5: 'This team member’s knowledge and skills that contributed to the project were excellent.',
    4: 'This team member’s knowledge and skills that contributed to the project were above average.',
    3: 'This team member’s knowledge and skills that contributed to the project were average.',
    2: 'This team member’s knowledge and skills that contributed to the project were slightly below average.',
    1: 'This team member’s knowledge and skills that contributed to the project were far below average.',
  });

  const contribution = byId('overall_contribution');
  assert.equal(contribution.name, 'Overall Contribution');
  assert.equal(
    contribution.description,
    'How much did each team member contribute to the overall successful completion of the project?',
  );
  assert.deepEqual(contribution.scaleDescriptions, {
    5: 'This team member’s contribution was excellent.',
    4: 'This team member’s contribution was above average.',
    3: 'This team member’s contribution was average.',
    2: 'This team member’s contribution was slightly below average.',
    1: 'This team member’s contribution was far below average.',
  });

  const feedback = rubric.overallFeedback;
  assert.equal(feedback.id, 'overall_feedback');
  assert.equal(
    feedback.description,
    'Please provide constructive feedback for each member of your team. You might offer information about a team member’s '
      + 'strengths or leave critical feedback for the team member and instructor to read.',
  );
});

test('TC-13-25: the written feedback limits are unchanged (the sponsor\'s sheet states none)', () => {
  assert.equal(rubric.overallFeedback.type, 'text');
  assert.equal(rubric.overallFeedback.required, true);
  assert.equal(rubric.overallFeedback.minLength, 10);
  assert.equal(rubric.overallFeedback.maxLength, 1000);
});
