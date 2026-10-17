// Group Member Evaluation Rubric Configuration
// This is the hardcoded rubric provided by sponsors

const EVALUATION_RUBRIC = {
  title: "Group Member Evaluation Rubric",
  description: "Students will use this rubric to evaluate individual group members or class members.",
  criteria: [
    {
      id: "professionalism",
      name: "Professionalism",
      description: "How well did each team member maintain professionalism throughout the project? Behaviors to consider: respect, punctuality, meeting deadlines, using technology effectively.",
      scale: "1-5",
      scaleDescriptions: {
        5: "Acted professionally at all times",
        4: "Acted professionally most of the time",
        3: "Acted professionally some of the time",
        2: "Rarely acted professionally",
        1: "Never acted professionally"
      },
      required: true
    },
    {
      id: "communication",
      name: "Communication",
      description: "How well did each team member communicate appropriately? Behaviors to consider academic dialogue, listening, constructive feedback, positive interactions.",
      scale: "1-5",
      scaleDescriptions: {
        5: "Communicated appropriately at all times",
        4: "Communicated appropriately most of the time",
        3: "Communicated appropriately some of the time",
        2: "Rarely communicated appropriately",
        1: "Never communicated appropriately"
      },
      required: true
    },
    {
      id: "work_ethic",
      name: "Work Ethic",
      description: "Was the team member dedicated to completing the necessary work?",
      scale: "1-5",
      scaleDescriptions: {
        5: "Excellent work ethic",
        4: "Above average",
        3: "Average",
        2: "Slightly below average",
        1: "Far below average"
      },
      required: true
    },
    {
      id: "content_knowledge_skills",
      name: "Content Knowledge & Skills",
      description: "Did the team member have/acquire the knowledge and skills needed for project success? Behaviors to consider vocabulary, research, technology use, role flexibility.",
      scale: "1-5",
      scaleDescriptions: {
        5: "Excellent knowledge and skills",
        4: "Above average",
        3: "Average",
        2: "Slightly below average",
        1: "Far below average"
      },
      required: true
    },
    {
      id: "overall_contribution",
      name: "Overall Contribution",
      description: "How much did each team member contribute to the project's success?",
      scale: "1-5",
      scaleDescriptions: {
        5: "Excellent contribution",
        4: "Above average",
        3: "Average",
        2: "Slightly below average",
        1: "Far below average"
      },
      required: true
    },
    {
      id: "participation",
      name: "Participation",
      description: "Rate how your team members participated.",
      scale: "1-5",
      scaleDescriptions: {
        5: "Participated fully",
        4: "Participated most of the time",
        3: "Participated to some extent",
        2: "Did not participate",
        1: "Hindered the group"
      },
      required: true
    }
  ],
  overallFeedback: {
    id: "overall_feedback",
    name: "Overall Feedback",
    description: "Provide constructive feedback for each member (strengths and/or areas for improvement).",
    type: "text",
    required: true,
    minLength: 10,
    maxLength: 1000
  }
};

module.exports = EVALUATION_RUBRIC;