/** Question import: CSV reader + row validation (pure).   npm run test:question-import */
import assert from "node:assert/strict";
import { IMPORT_MAX_ROWS, mapQuestions, parseCsv, type ImportContext } from "../../src/lib/question-import";

const ctx: ImportContext = {
  subjects: [{ slug: "bt-business-and-technology", code: "BT" }, { slug: "ma-management-accounting", code: "MA" }],
  topics: [{ id: "t1", subjectSlug: "bt-business-and-technology", title: "Stakeholders" }],
  existing: [{ subjectSlug: "bt-business-and-technology", text: "An already existing question about stakeholders?" }],
};
const H = "subject,topic,text,a,b,c,d,correct,explanation,points,difficulty,status,tags";
const row = (o: Partial<Record<string, string>> = {}) => {
  const v = { subject: "BT", topic: "", text: "Which of these is a stakeholder of a company?", a: "Shareholders", b: "The weather", c: "A logo", d: "None", correct: "A", explanation: "Shareholders are a stakeholder group.", points: "2", difficulty: "easy", status: "draft", tags: "x, y", ...o };
  return [v.subject, v.topic, v.text, v.a, v.b, v.c, v.d, v.correct, v.explanation, v.points, v.difficulty, v.status, v.tags].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
};
const plan = (...rows: string[]) => mapQuestions(parseCsv([H, ...rows].join("\r\n")), ctx);
const codes = (p: ReturnType<typeof plan>) => p.errors.map((e) => `${e.line}:${e.column}:${e.code}`);

// ── CSV reader
assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
assert.deepEqual(parseCsv("a;b\r\n1;2\r\n\r\n3;4"), [["a", "b"], ["1", "2"], ["3", "4"]], "semicolon (Excel in RU / UZ locales), CRLF, blank lines");
assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]], "tab");
assert.deepEqual(parseCsv('﻿a,b\n"line1\nline2",2'), [["a", "b"], ["line1\nline2", "2"]], "BOM removed, line break inside quotes kept");
assert.deepEqual(parseCsv(""), []);

// ── a good file
let p = plan(row(), row({ text: "Second question that is different enough?", correct: "c", difficulty: "hard", points: "3" }));
assert.equal(p.errors.length, 0); assert.equal(p.questions.length, 2);
assert.deepEqual([p.questions[0]!.correctIndex, p.questions[1]!.correctIndex], [0, 2]);
assert.deepEqual(p.questions[0]!.tags, ["x", "y"]); assert.equal(p.questions[1]!.difficulty, "hard");
assert.equal(p.questions[0]!.subjectSlug, "bt-business-and-technology"); assert.equal(p.questions[0]!.status, "draft");

// ── defaults and alternative spellings
p = plan(row({ points: "", difficulty: "", status: "", correct: "2", subject: "bt", tags: "" }));
assert.equal(p.errors.length, 0); assert.deepEqual([p.questions[0]!.points, p.questions[0]!.difficulty, p.questions[0]!.correctIndex], [1, "medium", 1]);

// ── topic resolution by exact title (case-insensitive) inside the subject
p = plan(row({ topic: "stakeholders" })); assert.equal(p.questions[0]!.topicId, "t1");
p = plan(row({ topic: "Nonexistent" })); assert.deepEqual(codes(p), ["2:topic:TOPIC_NOT_FOUND"]);
p = plan(row({ subject: "MA", topic: "Stakeholders" })); assert.deepEqual(codes(p), ["2:topic:TOPIC_NOT_FOUND"], "a topic of another subject does not match");

// ── every bad row is reported with its line, good rows are still usable
p = plan(row(), row({ subject: "XX" }), row({ correct: "E" }), row({ difficulty: "extreme" }), row({ status: "maybe" }), row({ text: "short" }), row({ a: "same", b: "same" }), row({ points: "0" }), row({ points: "abc" }), row({ subject: "" }));
assert.equal(p.questions.length, 1);
assert.deepEqual(codes(p), ["3:subject:SUBJECT_NOT_FOUND", "4:correct:CORRECT_INVALID", "5:difficulty:DIFFICULTY_INVALID", "6:status:STATUS_INVALID", "7:text:min:10", "8:a:OPTIONS_NOT_UNIQUE", "9:points:range:1:100", "10:points:range:1:100", "11:subject:required"]);

// ── duplicates: against the bank and inside the file
p = plan(row({ text: "An already existing question about stakeholders?" }), row({ text: "A brand new unique question here, really?" }), row({ text: "  a brand NEW unique question   here, really? " }));
assert.equal(p.questions.length, 1); assert.deepEqual(p.duplicates, [2, 4]);

// ── file level problems
assert.equal(mapQuestions([], ctx).fileProblem, "EMPTY");
assert.equal(mapQuestions(parseCsv(H), ctx).fileProblem, "EMPTY");
const missing = mapQuestions(parseCsv("subject,text\nBT,hello"), ctx); assert.equal(missing.fileProblem, "MISSING_COLUMNS"); assert.ok(missing.missing!.includes("correct"));
assert.equal(plan(...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => row({ text: `Question number ${i} about something?` }))).fileProblem, "TOO_MANY_ROWS");

// ── Russian headers and answer letters (Cyrillic а / в / с look like latin)
const ru = parseCsv("Предмет;Тема;Вопрос;A;B;C;D;Правильный ответ;Пояснение;Баллы;Сложность\nBT;;Какой из вариантов относится к заинтересованным сторонам?;Акционеры;Погода;Логотип;Ничего;а;Акционеры — заинтересованная сторона компании.;1;лёгкий");
const rp = mapQuestions(ru, ctx); assert.equal(rp.errors.length, 0, JSON.stringify(rp.errors)); assert.equal(rp.questions[0]!.correctIndex, 0); assert.equal(rp.questions[0]!.difficulty, "easy");

// ── hostile text is kept as plain data (rendered escaped everywhere); formula-looking cells are not executed anywhere
p = plan(row({ text: "=HYPERLINK(\"http://evil\",\"x\") is this a question?", a: "<script>alert(1)</script>" }));
assert.equal(p.errors.length, 0); assert.equal(p.questions[0]!.options[0], "<script>alert(1)</script>");

console.log("question-import: all checks passed");
