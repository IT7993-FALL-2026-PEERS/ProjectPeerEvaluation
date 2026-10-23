// Group Member Evaluation Rubric Configuration
// This is the hardcoded rubric provided by sponsors. The wording is the sponsor's rubric sheet of 19 Oct 2026
// (CICD-74); the criterion ids and the 1-5 scales are what scoring, the all-fives flag and the CSV export use.

const EVALUATION_RUBRIC = {
  title: "Group Member Evaluation Rubric",
  description: "Students will use this rubric to evaluate individual group members or class members.",
  criteria: [
    {
      id: "professionalism",
      name: "Professionalism",
      description: "How well did each team member maintain the appropriate level of professionalism throughout the project? Behaviors to consider: shows respect towards team members, arrives to meetings on time, meets deadlines, uses applicable technology, etc.",
      scale: "1-5",
      scaleDescriptions: {
        5: "This team member acted in a professional way at all times.",
        4: "This team member acted in a professional way most of the time.",
        3: "This team member acted in a professional way some of the time.",
        2: "This team member rarely acted in a professional way.",
        1: "This team member never acted in a professional way."
      },
      required: true
    },
    {
      id: "communication",
      name: "Communication",
      description: "How well did each team member communicate in the appropriate manner for this project? Behaviors to consider: uses academic dialogue, listens to other team members, offers and accepts feedback constructively, facilitates positive interactions among team members, etc.",
      scale: "1-5",
      scaleDescriptions: {
        5: "This team member communicated appropriately at all times.",
        4: "This team member communicated appropriately most of the time.",
        3: "This team member communicated appropriately some of the time.",
        2: "This team member rarely communicated appropriately.",
        1: "This team member never communicated appropriately."
      },
      required: true
    },
    {
      id: "work_ethic",
      name: "Work Ethic",
      description: "Was the team member dedicated to completing the amount of work necessary to achieve the goals of the group?",
      scale: "1-5",
      scaleDescriptions: {
        5: "This team member’s work ethic was excellent.",
        4: "This team member’s work ethic was above average.",
        3: "This team member’s work ethic was average.",
        2: "This team member’s work ethic was slightly below average.",
        1: "This team member’s work ethic was far below average."
      },
      required: true
    },
    {
      id: "content_knowledge_skills",
      name: "Content Knowledge and Skills",
      description: "Did the team member have or acquire the knowledge and skills necessary to contribute to the successful completion of the project? Behaviors to consider: understands common vocabulary, completes background readings or research, knows how to use necessary equipment or technology, has ability to fill multiple roles within the group, etc.",
      scale: "1-5",
      scaleDescriptions: {
        5: "This team member’s knowledge and skills that contributed to the project were excellent.",
        4: "This team member’s knowledge and skills that contributed to the project were above average.",
        3: "This team member’s knowledge and skills that contributed to the project were average.",
        2: "This team member’s knowledge and skills that contributed to the project were slightly below average.",
        1: "This team member’s knowledge and skills that contributed to the project were far below average."
      },
      required: true
    },
    {
      id: "overall_contribution",
      name: "Overall Contribution",
      description: "How much did each team member contribute to the overall successful completion of the project?",
      scale: "1-5",
      scaleDescriptions: {
        5: "This team member’s contribution was excellent.",
        4: "This team member’s contribution was above average.",
        3: "This team member’s contribution was average.",
        2: "This team member’s contribution was slightly below average.",
        1: "This team member’s contribution was far below average."
      },
      required: true
    },
    {
      id: "participation",
      name: "Participation",
      description: "Rate how your team members participated.",
      scale: "1-5",
      scaleDescriptions: {
        5: "They participated fully and exceeded expectations.",
        4: "They participated fully.",
        3: "They participated to a moderate extent.",
        2: "They participated to a limited extent / rarely.",
        1: "They did not participate or hindered the group."
      },
      required: true
    }
  ],
  overallFeedback: {
    id: "overall_feedback",
    name: "Overall Feedback",
    description: "Please provide constructive feedback for each member of your team. You might offer information about a team member’s strengths or leave critical feedback for the team member and instructor to read.",
    type: "text",
    required: true,
    minLength: 10,
    maxLength: 1000
  }
};

module.exports = EVALUATION_RUBRIC;
