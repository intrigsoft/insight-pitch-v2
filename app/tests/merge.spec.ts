// The three-way paragraph merge behind change requests (no browser needed).
import { expect, test } from "@playwright/test";
import { applyDecisions, mergeRequest } from "../src/lib/merge";

const doc = (...paras: string[]) => ({ title: "Legal aid desks", summary: "Free advice at court.", body: paras.join("\n\n") });
const PROB = "## The problem\n\nMany people come to court without a lawyer.";
const PROP = "Open a desk in every court, staffed two days a week by volunteer lawyers and supervised law students.";

test("a change only the request made merges cleanly", () => {
  const base = doc(PROB, PROP);
  const theirs = doc(PROB, PROP, "## Funding\n\nAbout 600,000 a year.");
  const { hunks } = mergeRequest(base, base, theirs);
  expect(hunks.map((h) => h.kind)).toEqual(["theirs"]);
  const r = applyDecisions(mergeRequest(base, base, theirs).chunks, { 0: "accept" }, {}, base)!;
  expect(r.doc.body).toBe(theirs.body);
  expect(r).toMatchObject({ accepted: 1, total: 1 });
});

test("a paragraph both sides edited is a conflict, and the lead's own additions around it stay out of it", () => {
  const base = doc(PROB, PROP);
  // The lead edited the paragraph and added sections after it; the request edited the same paragraph.
  const ours = doc(PROB, PROP.replace("two days", "three days"), "## Funding\n\nAbout 600,000 a year.", "- Cases resolved early");
  const theirs = doc(PROB, PROP.replace("supervised law students", "final-year law students supervised by a practising lawyer"));
  const { chunks, hunks } = mergeRequest(base, ours, theirs);
  expect(hunks).toHaveLength(1);
  expect(hunks[0]).toMatchObject({ kind: "conflict", ours: [ours.body.split("\n\n")[2]], theirs: [theirs.body.split("\n\n")[2]] });
  // Picking the request's version replaces only that paragraph; the lead's new sections remain.
  const r = applyDecisions(chunks, { 0: "theirs" }, {}, ours)!;
  expect(r.doc.body).toContain("final-year law students");
  expect(r.doc.body).toContain("## Funding");
  expect(r.doc.body).toContain("- Cases resolved early");
  // A combined version replaces it with the lead's own wording.
  const c = applyDecisions(chunks, { 0: "edit" }, { 0: "Open a desk three days a week, with supervised final-year students." }, ours)!;
  expect(c.doc.body).toContain("Open a desk three days a week, with supervised final-year students.");
  expect(c.doc.body).toContain("## Funding");
});

test("title changes merge as their own change, and undecided changes block the merge", () => {
  const base = doc(PROB, PROP);
  const theirs = { ...base, title: "Free legal aid desks" };
  const { chunks, hunks } = mergeRequest(base, base, theirs);
  expect(hunks).toHaveLength(1);
  expect(applyDecisions(chunks, {}, {}, base)).toBeNull();
  expect(applyDecisions(chunks, { 0: "accept" }, {}, base)!.doc.title).toBe("Free legal aid desks");
  expect(applyDecisions(chunks, { 0: "reject" }, {}, base)!.doc.title).toBe("Legal aid desks");
});
