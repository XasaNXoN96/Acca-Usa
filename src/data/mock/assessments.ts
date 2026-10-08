/**
 * DEMO DATA — question bank. Correct answers live ONLY here (server side).
 * They are stripped before anything is sent to the browser (see services/mock/tests).
 */
export interface QuestionRecord {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

const q = (
  id: string,
  text: string,
  options: [string, string, string, string],
  correct: "a" | "b" | "c" | "d",
  explanation: string,
): QuestionRecord => ({
  id,
  text,
  options: options.map((t, i) => ({ id: "abcd"[i] as string, text: t })),
  correctOptionId: correct,
  explanation,
});

export const questionBank: QuestionRecord[] = [
  q("q-fixed-cost", "Which of the following is an example of a fixed cost?", ["Direct materials", "Factory rent", "Sales commission", "Raw materials"], "b",
    "Factory rent stays the same in total within the relevant range of activity. Direct materials, raw materials and sales commission all rise and fall with activity."),
  q("q-variable-behaviour", "How does a variable cost behave as activity increases?", ["Total cost is constant; cost per unit rises", "Total cost rises; cost per unit is constant", "Total cost falls; cost per unit is constant", "Total cost and cost per unit both rise"], "b",
    "A variable cost changes in total in proportion to activity, while the cost per unit stays constant."),
  q("q-step-cost", "A supervisor is needed for every 20 production workers. Supervisor salaries are an example of:", ["A variable cost", "A semi-variable cost", "A step-fixed cost", "A direct cost"], "c",
    "Fixed within a range of activity but jumping to a new level when capacity thresholds are passed: a step-fixed cost."),
  q("q-semi-variable", "A telephone bill has a fixed line rental plus a charge per call. This is a:", ["Fixed cost", "Semi-variable cost", "Variable cost", "Step cost"], "b",
    "Part of the cost is fixed (rental) and part varies with usage (calls): a semi-variable, or mixed, cost."),
  q("q-direct-cost", "Which cost can be traced directly to a single cost unit?", ["Wages of a machine operator making only that product", "Factory manager's salary", "Depreciation of the factory building", "Canteen costs"], "a",
    "Direct costs can be identified with a specific cost unit. The other items are shared overheads."),
  q("q-overhead", "Which of the following is a production overhead?", ["Direct labour", "Direct materials", "Depreciation of factory equipment", "Royalty for one specific product"], "c",
    "Depreciation of shared factory equipment cannot be traced to one unit, so it is an indirect (overhead) cost."),
  q("q-cost-unit", "A cost unit is best described as:", ["A department that incurs costs", "A unit of product or service to which costs are assigned", "A fixed amount of overhead", "A budgeted level of output"], "b",
    "Cost units are the units of product or service for which costs are ascertained."),
  q("q-prime-cost", "Prime cost is the total of:", ["Direct materials and production overheads", "Direct materials, direct labour and direct expenses", "Direct labour and production overheads", "All production costs"], "b",
    "Prime cost = direct materials + direct labour + direct expenses."),
  q("q-period-cost", "Under absorption costing, which is normally treated as a period cost?", ["Direct labour", "Factory rent", "Office administration rent", "Direct materials"], "c",
    "Administration costs are charged to the period in which they are incurred rather than included in product cost."),
  q("q-total-cost", "Fixed costs are $20,000 and variable cost is $5 per unit. What is the total cost of producing 4,000 units?", ["$20,000", "$25,000", "$40,000", "$60,000"], "c",
    "Total cost = 20,000 + (5 × 4,000) = $40,000."),

  q("q-intro-users", "Management accounting information is primarily prepared for:", ["Shareholders", "Tax authorities", "Managers inside the organisation", "Lenders"], "c",
    "Management accounting serves internal decision makers; financial accounting serves external users."),
  q("q-intro-statutory", "Which feature is typical of financial accounting rather than management accounting?", ["Prepared whenever managers need it", "Required by law and accounting standards", "Often forward looking", "Can be in any format"], "b",
    "Financial statements must follow legal and standards-based formats; management information is flexible."),
  q("q-intro-cost-centre", "A cost centre is:", ["A unit that earns revenue and incurs costs", "A location or function for which costs are collected", "A product that generates profit", "A budget approved by the board"], "b",
    "Cost centres collect costs; a profit centre is responsible for both costs and revenues."),
  q("q-intro-profit-centre", "A manager is responsible for both revenues and costs of a division. The division is a:", ["Cost centre", "Profit centre", "Investment centre only", "Revenue centre only"], "b",
    "A profit centre accounts for both revenues and costs."),
  q("q-intro-quality", "Which is NOT a quality of good management information?", ["Timely", "Relevant", "Accurate enough for its purpose", "Presented in a legally prescribed format"], "d",
    "Management information does not need a legally prescribed format; it must be useful for decision making."),
];

export interface TestRecord {
  id: string;
  subjectSlug: string;
  topicId?: string;
  title: string;
  durationMinutes: number;
  passMark: number;
  questionIds: string[];
}

export const testRecords: TestRecord[] = [
  {
    id: "ma-cost-classification",
    subjectSlug: "ma",
    topicId: "ma-cost-classification",
    title: "Cost classification — topic test",
    durationMinutes: 20,
    passMark: 70,
    questionIds: questionBank.slice(0, 10).map((x) => x.id),
  },
  {
    id: "ma-introduction",
    subjectSlug: "ma",
    topicId: "ma-introduction-to-management-accounting",
    title: "Introduction to management accounting — quiz",
    durationMinutes: 10,
    passMark: 60,
    questionIds: questionBank.slice(10).map((x) => x.id),
  },
];
