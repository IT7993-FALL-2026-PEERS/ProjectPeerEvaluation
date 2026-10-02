const Evaluation = require('../../models/Evaluation');
const { IDS } = require('./seed');

// A fixed set of submitted evaluations on top of the seed, so report tests can check exact totals.
//
// Every criterion is scored 1-5 except participation (1-4), which the report scales by 5/4. A
// student's score is the mean of all the ratings received, as a percentage:
//
//   Ben  received {4,4,4,4,4,3}  ->  (4*5 + 3*1.25) / 6 * 20 = 79.17   (C)   from Ann
//   Ann  received {5,5,5,5,5,4}  ->  100                        (A)   from Ben, all fives
//   Di   received {3,3,3,3,3,2}  ->  (3*5 + 2*1.25) / 6 * 20 = 58.33   (F)   from Cy
//   Cy   received {4,5,4,5,4,4}  ->  (22 + 5) / 6 * 20       = 90.00   (A)   from Di
//
// Team Alpha (Ann, Ben) averages 89.585; team Beta (Cy, Di) averages 74.165.
const ratings = (professionalism, communication, work_ethic, content_knowledge_skills, overall_contribution, participation) => (
  { professionalism, communication, work_ethic, content_knowledge_skills, overall_contribution, participation }
);

const FIXED_EVALUATIONS = [
  { evaluator: IDS.ann, student: IDS.ben, ratings: ratings(4, 4, 4, 4, 4, 3), feedback: 'Reliable and prepared every week.' },
  { evaluator: IDS.ben, student: IDS.ann, ratings: ratings(5, 5, 5, 5, 5, 4), feedback: 'Outstanding work on every task.' },
  { evaluator: IDS.cy, student: IDS.di, ratings: ratings(3, 3, 3, 3, 3, 2), feedback: 'Often late to meetings and a bit lazy.' },
  { evaluator: IDS.di, student: IDS.cy, ratings: ratings(4, 5, 4, 5, 4, 4), feedback: 'Good communicator and a steady contributor.' },
];

const EXPECTED_SCORES = { ann: 100, ben: 79.17, cy: 90, di: 58.33 };

async function seedEvaluations() {
  await Evaluation.create(FIXED_EVALUATIONS.map((e) => ({
    course_id: IDS.courseAda,
    evaluator_id: e.evaluator,
    student_id: e.student,
    ratings: e.ratings,
    overall_feedback: e.feedback,
    evaluation_token: 'a'.repeat(64),
  })));
}

module.exports = { seedEvaluations, FIXED_EVALUATIONS, EXPECTED_SCORES };
