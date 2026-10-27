const Evaluation = require('../../models/Evaluation');
const { IDS } = require('./seed');

// A fixed set of submitted evaluations on top of the seed, so report tests can check exact totals.
//
// Every criterion, participation included, is scored 1-5. A student's score is the mean of all the
// ratings received, as a percentage:
//
//   Ben  received {4,4,4,4,4,3}  ->  23 / 6 * 20 = 76.67   (C)   from Ann
//   Ann  received {5,5,5,5,5,5}  ->  100          (A)   from Ben, all fives
//   Di   received {3,3,3,3,3,2}  ->  17 / 6 * 20 = 56.67   (F)   from Cy
//   Cy   received {4,5,4,5,4,5}  ->  27 / 6 * 20 = 90.00   (A)   from Di
//
// Team 1 (Ann, Ben) averages 88.335; Team 2 (Cy, Di) averages 73.335.
const ratings = (professionalism, communication, work_ethic, content_knowledge_skills, overall_contribution, participation) => (
  { professionalism, communication, work_ethic, content_knowledge_skills, overall_contribution, participation }
);

const FIXED_EVALUATIONS = [
  { evaluator: IDS.ann, student: IDS.ben, ratings: ratings(4, 4, 4, 4, 4, 3), feedback: 'Reliable and prepared every week.' },
  { evaluator: IDS.ben, student: IDS.ann, ratings: ratings(5, 5, 5, 5, 5, 5), feedback: 'Outstanding work on every task.' },
  { evaluator: IDS.cy, student: IDS.di, ratings: ratings(3, 3, 3, 3, 3, 2), feedback: 'Often late to meetings and a bit lazy.' },
  { evaluator: IDS.di, student: IDS.cy, ratings: ratings(4, 5, 4, 5, 4, 5), feedback: 'Good communicator and a steady contributor.' },
];

// Two sets used by the tests that submit or store a single evaluation: ordinary ratings, and the ones
// the student tests send through the form.
const ORDINARY_RATINGS = ratings(4, 4, 4, 4, 4, 3);
const STUDENT_RATINGS = ratings(4, 5, 4, 3, 4, 3);

const EXPECTED_SCORES = { ann: 100, ben: 76.67, cy: 90, di: 56.67 };

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

module.exports = { seedEvaluations, FIXED_EVALUATIONS, EXPECTED_SCORES, ORDINARY_RATINGS, STUDENT_RATINGS };
