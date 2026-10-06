// Sample data taken from the Insight Pitch v2 design. Times are offsets from "now" so the
// relative labels in the UI ("2 days ago", "6h") match the design whenever the seed runs.

export const SEED_PASSWORD = "insight2026";

export const PEOPLE = [
  { key: "maya", name: "Maya Chen", initials: "MC", email: "maya.chen@insight.gov", role: "admin", title: "Policy advisor", org: "Ministry of Public Administration", location: "Capital district", joined: "2025-01-01", bio: "I run the Insight Pitch programme and draft proposals on access to justice and rural health.", reads: ["en", "si"], strengthsPublic: false },
  { key: "priya", name: "Priya Raman", initials: "PR", email: "priya.raman@insight.gov", role: "official", title: "Health infrastructure planner", org: "Regional Health Office", location: "Northern region", joined: "2025-03-01", bio: "I plan hospital and clinic capacity for the northern region. Most of my proposals start from referral and travel-time data.", reads: ["en", "si"], strengthsPublic: true },
  { key: "daniel", name: "Daniel Okafor", initials: "DO", email: "daniel.okafor@insight.gov", role: "citizen", title: "Volunteer", org: "Open Contracting Network", location: "Capital district", joined: "2025-04-01", bio: "Procurement transparency volunteer. I read contracts so others don’t have to.", reads: ["en", "fr"], strengthsPublic: true },
  { key: "lena", name: "Lena Fischer", initials: "LF", email: "lena.fischer@example.org", role: "citizen", title: "School board member", org: "", location: "Eastern district", joined: "2025-05-01", bio: "Parent of two and member of the district school board.", reads: ["en", "es"], strengthsPublic: false },
  { key: "tomas", name: "Tomás Herrera", initials: "TH", email: "tomas.herrera@example.org", role: "official", title: "Heritage officer", org: "Old Town Municipal Council", location: "Old Town", joined: "2025-02-01", bio: "I look after the old town’s listed buildings and work with traders on visitor plans.", reads: ["en", "es", "pt"], strengthsPublic: true },
  { key: "sam", name: "Sam Whitfield", initials: "SW", email: "sam.whitfield@example.org", role: "citizen", title: "Transport engineer", org: "", location: "Capital district", joined: "2025-06-01", bio: "Civil engineer working on public transit. Interested in anything that moves people more reliably.", reads: ["en"], strengthsPublic: true },
  { key: "jun", name: "Jun Park", initials: "JP", email: "jun.park@example.org", role: "official", title: "Records modernisation lead", org: "Land Registry Department", location: "Capital district", joined: "2025-03-01", bio: "Leading the move from paper land titles to digital records.", reads: ["en"], strengthsPublic: true },
  { key: "ava", name: "Ava Moreau", initials: "AM", email: "ava.moreau@example.org", role: "citizen", title: "Retired quantity surveyor", org: "", location: "Southern district", joined: "2025-07-01", bio: "Forty years of costing public buildings. I check whether the numbers add up.", reads: ["en", "fr"], strengthsPublic: false },
  { key: "kai", name: "Kai Moreno", initials: "KM", email: "kai.moreno@example.org", role: "citizen", title: "", org: "", location: "Western district", joined: "2026-08-01", bio: "", reads: ["en"], strengthsPublic: false },
  { key: "rob", name: "Rob Kessler", initials: "RK", email: "rob.kessler@example.org", role: "citizen", title: "", org: "", location: "Central district", joined: "2026-09-01", bio: "", reads: ["en"], strengthsPublic: false },
] as const;

export type PersonKey = (typeof PEOPLE)[number]["key"];

export const STREAM_COLORS = ["#2e5e45", "#2f7680", "#3b6a8f", "#4c5aa0", "#7a3f5e", "#a0522d", "#8a5a2b", "#5b7a2e"];

export const STREAMS = [
  { id: "health", name: "Healthcare", desc: "Hospitals, public health, clinics and medical services.", color: "#2f7680", active: true, related: ["finance", "it"] },
  { id: "finance", name: "Finance", desc: "Public budgets, taxation, procurement and spending.", color: "#8a5a2b", active: true, related: ["health"] },
  { id: "law", name: "Law & Justice", desc: "Legislation, courts, legal aid and regulation.", color: "#7a3f5e", active: true, related: ["it"] },
  { id: "it", name: "IT & Digital", desc: "Digital public services, data, connectivity and e-government.", color: "#4c5aa0", active: true, related: ["health", "law"] },
  { id: "tourism", name: "Tourism", desc: "Visitor economy, heritage sites and destination promotion.", color: "#a0522d", active: true, related: ["transport", "env"] },
  { id: "transport", name: "Transport", desc: "Roads, public transit, cycling and freight.", color: "#3b6a8f", active: true, related: ["tourism", "env"] },
  { id: "env", name: "Environment", desc: "Climate, conservation, waste and clean energy.", color: "#5b7a2e", active: true, related: ["tourism", "transport"] },
  { id: "edu", name: "Education", desc: "Schools, universities, skills and lifelong learning.", color: "#2e5e45", active: true, related: [] },
  { id: "agri", name: "Agriculture", desc: "Farming, food security and rural livelihoods.", color: "#8a5a2b", active: false, related: [] },
];

// Sample files shipped in seed-assets/ (see lib/storage.ts), so the sample proposals' media work everywhere.
export const UPLOADS = [
  { id: "5eed0000-0000-4000-8000-000000000001", kind: "image", name: "proposed-site.jpg", contentType: "image/jpeg", file: "proposed-site.jpg" },
  { id: "5eed0000-0000-4000-8000-000000000002", kind: "file", name: "Cost estimate breakdown.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file: "cost-estimate-breakdown.xlsx" },
  { id: "5eed0000-0000-4000-8000-000000000003", kind: "file", name: "Site survey report.pdf", contentType: "application/pdf", file: "site-survey-report.pdf" },
  { id: "5eed0000-0000-4000-8000-000000000004", kind: "file", name: "Bar association letter of support.pdf", contentType: "application/pdf", file: "bar-association-letter.pdf" },
] as const;
const [SITE, COST, SURVEY, LETTER] = UPLOADS.map((u) => u.id);

const P1a = "## The problem\n\nAbout 340,000 people in the northern region live more than 70 km from a full-service hospital. Emergency patients travel an average of **95 minutes**, and the two existing clinics refer most cases out of the district ([regional referral data, 2025](https://health.example.gov/referrals-2025)).";
const P1cost = `## Cost and funding\n\nThe estimated capital cost is 48 million. Annual running costs are estimated at 9 million.\n\n| Source | Share | Amount |\n| National health infrastructure fund | 60% | 28.8 million |\n| Provincial budget | 25% | 12 million |\n| Development bank loan | 15% | 7.2 million |\n\n::file ${COST} | Cost estimate breakdown.xlsx | 6 KB`;
const P1v1 = P1a + "\n\n## Proposal\n\nBuild a 200-bed district hospital with emergency, maternity, surgery and outpatient departments on the public land next to the regional health office.";
const P1v2 = P1v1 + "\n\n" + P1cost;
const P1v3 =
  P1a +
  "\n\n## Proposal\n\nBuild a 200-bed district hospital on the public land next to the regional health office, in two phases:\n\n1. **Phase 1**, within 18 months: outpatient, maternity and emergency care.\n2. **Phase 2**: surgery and inpatient wards." +
  `\n\n::image ${SITE} | The proposed site, looking north from the regional health office | Level open land beside a two-storey office building, bordered by the regional road on the east side | 32 KB\n\n` +
  P1cost +
  "\n\n## Access\n\nThe site needs a 3 km upgraded access road and a bus stop on the regional route. The provincial roads authority would deliver the road alongside Phase 1." +
  `\n\n::video https://www.youtube.com/watch?v=northern-site | Walk-through of the proposed site and access route | 3:12\n\n::file ${SURVEY} | Site survey report.pdf | 40 KB`;
const T1 = "Build a 200-bed district hospital in the northern region";
const S1 = "The nearest full-service hospital is 70 km away for 340,000 residents. A district hospital would cut emergency travel times by more than half.";
const P2why = "## Why\n\nCitizens currently need a formal information request to see most government contracts, and responses take an average of 11 weeks.";
const P2v1 = P2why + "\n\n## Proposal\n\nPublish every signed contract above 5 million, with amendments and the winning bid, in a searchable online register within 30 days of signing.";
const P2v2 = P2why + "\n\n## Proposal\n\nPublish every signed contract above 1 million, with amendments and the winning bid, in a searchable online register within 30 days of signing.\n\n## Redaction\n\nPersonal data and genuinely security-sensitive clauses may be redacted. Each redaction must cite its legal basis, and the redaction log is itself public.";
const P3v1 = "## Proposal\n\nProvide a free daily meal to every primary school student in the district, starting with the 40 schools with the highest absence rates.\n\n## Local sourcing\n\nAt least 40% of produce would be bought from farms within the district through simplified, published tenders.\n\n## Expected outcomes\n\nHigher attendance, better nutrition indicators in annual health checks, and a stable buyer for small farms.";
const P5prob = "## The problem\n\nMore than half of people appearing in district courts for civil matters have no legal representation. Many cannot afford a lawyer and don't know that free help exists.";
const P5fund = "## Funding\n\nThe bar association has offered volunteer hours. The remaining cost, mainly coordination staff and desk space, is about **600,000 a year**.";
const P5v1 = P5prob + "\n\n## Proposal\n\nOpen a free legal aid desk in every district court, staffed two days a week by volunteer lawyers and supervised law students.\n\n" + P5fund;
const P5draft = P5prob + "\n\n## Proposal\n\nOpen a free legal aid desk in every district court, staffed three days a week by volunteer lawyers and supervised law students, with one full-time coordinator for the programme.\n\n" + P5fund + "\n\n| Item | Per year |\n| Coordinator (1 full-time) | 380,000 |\n| Desk space and equipment | 140,000 |\n| Training for law students | 80,000 |\n\n## Measuring success\n\n- Share of civil cases with some form of legal advice\n- Number of cases resolved before a full hearing" + `\n\n::file ${LETTER} | Bar association letter of support.pdf | 25 KB`;
// Change requests from the design: Daniel and Sam on the legal aid proposal (Sam's overlaps with Maya's draft), Maya on the hospital.
const P5dan = P5v1.replace("Many cannot afford a lawyer and don't know that free help exists.", "Many cannot afford a lawyer, and most don't know that free help exists.\n\nMost of these cases are family, tenancy and debt disputes, where the other side often has a lawyer. The desks would advise on all three.");
const P5sam = P5v1.replace("staffed two days a week by volunteer lawyers and supervised law students.", "staffed two days a week by volunteer lawyers and final-year law students supervised by a practising lawyer.");
const P1maya = P1v3.replace("alongside Phase 1.", "alongside Phase 1 and maintain it afterwards from its regular maintenance budget.");
const P4v1 = "## Proposal\n\nCreate a signed 4 km walking trail linking the old town's twelve listed buildings, with a small visitor centre in the former customs house.";
const P4v2 = P4v1 + "\n\n## Why now\n\nVisitor numbers have grown 30% in three years, but most visitors stay less than half a day. A trail gives them reasons to stay longer and spreads spending beyond the main square.\n\n## Protecting the site\n\nThe trail uses existing streets. Coach parking moves to the edge of the old town, with a shuttle to the visitor centre.";
const P7v1 = "## Proposal\n\nRun a 12-month pilot replacing diesel buses with 14 electric buses on routes 4 and 11, the two busiest city routes.\n\n## Costs\n\nThe buses are leased, so capital cost is limited to two depot charging stations. Fuel and maintenance savings are expected to cover about 70% of the lease.\n\n## What we'd measure\n\nReliability, operating cost per kilometre, air quality on both routes, and passenger satisfaction.";
const P8v1 = "## The problem\n\nLand disputes make up roughly a third of civil cases in district courts. Most come from paper records that are incomplete, duplicated or lost.\n\n## Proposal\n\nDigitise the land registry over three years, starting with the districts with the most disputes. Every title gets a unique ID, a mapped boundary and a full ownership history that owners can check online.";
const P6draft = "## The problem\n\nRural health centres often have a nurse but no doctor on site. Patients travel to the district hospital for consultations that could happen remotely.\n\n## Proposal\n\nInstall telemedicine kiosks in 25 rural health centres, connecting nurses and patients to on-call doctors at the district hospital by video.";

// Ages are durations before now: "2d", "6h", "2w".
type Age = string;
type SeedReply = [PersonKey, string, Age, number];
type SeedComment = { author: PersonKey; text: string; age: Age; likes: number; replies: SeedReply[] };
type SeedVersion = { n: number; age: Age; note: string; title: string; summary: string; body: string };
export type SeedProposal = {
  key: string;
  author: PersonKey;
  scores: Record<string, number>;
  updated: Age;
  following: boolean;
  draft: { title: string; summary: string; body: string; saved: Age } | null;
  versions: SeedVersion[];
  comments: SeedComment[];
};

const cm = (author: PersonKey, text: string, age: Age, likes: number, replies: SeedReply[] = []): SeedComment => ({ author, text, age, likes, replies });
// Version dates in the design are calendar dates relative to Oct 2 (the design's "today").
const v = (n: number, daysBefore: number, note: string, title: string, summary: string, body: string): SeedVersion => ({ n, age: `${daysBefore}d`, note, title, summary, body });

export const PROPOSALS: SeedProposal[] = [
  {
    key: "p1", author: "priya", scores: { health: 9, finance: 6, transport: 3 }, updated: "2d", following: false, draft: null,
    versions: [v(1, 20, "Initial version", T1, S1, P1v1), v(2, 12, "Added cost and funding sources", T1, S1, P1v2), v(3, 2, "Split construction into two phases; added access road plan", T1, S1, P1v3)],
    comments: [
      cm("daniel", "Phasing makes this much easier to fund. Good to see the outpatient wing opening first.", "2d", 6, [
        ["priya", "That was the main feedback from the v2 consultation. Thanks for pushing on it.", "2d", 2],
        ["lena", "@Daniel Okafor the regional health board said the same at the last public meeting.", "1d", 3],
        ["sam", "Staffing is the real constraint. Is there a recruitment plan for doctors and nurses?", "1d", 4],
      ]),
      cm("jun", "Who maintains the access road after construction? The last project left that unclear.", "1d", 4, [
        ["priya", "The provincial roads authority. I’ll name them explicitly in the next version.", "1d", 1],
        ["kai", "Cheap bridging loans for contractors, message me at www.quickbuild-loans.example", "20h", 0],
      ]),
      cm("ava", "The capital estimate looks low compared with similar hospitals built in the last five years.", "20h", 2),
      cm("sam", "Could some beds be reserved for long-term care? The population is ageing faster than the forecasts assumed.", "6h", 1, [
        ["tomas", "Worth a separate proposal. It would change the finance score quite a bit.", "5h", 5],
      ]),
      cm("kai", "Does anyone know when the summer festival dates get announced?", "10h", 0),
      cm("rob", "Typical. Priya clearly has no idea what she’s doing and is padding her CV with this.", "3h", 0),
    ],
  },
  {
    key: "p2", author: "daniel", scores: { finance: 9, law: 7, it: 5 }, updated: "3d", following: false, draft: null,
    versions: [
      v(1, 14, "Initial version", "Publish all public procurement contracts online within 30 days", "Every signed government contract, with its amendments, in a searchable open register.", P2v1),
      v(2, 3, "Lowered threshold to 1 million; added redaction rules", "Publish all public procurement contracts online within 30 days", "Every signed government contract, with its amendments, in a searchable open register.", P2v2),
    ],
    comments: [
      cm("lena", "A register is only useful if the data is structured. Can we require a standard format?", "3d", 3, [
        ["daniel", "Yes. Contracts would follow an open data standard so they can be compared across agencies.", "3d", 2],
      ]),
      cm("jun", "The 30-day deadline is ambitious for smaller municipalities.", "2d", 4),
    ],
  },
  {
    key: "p3", author: "lena", scores: { edu: 8, health: 5, finance: 4, env: 3 }, updated: "5d", following: true, draft: null,
    versions: [v(1, 5, "Initial version", "Free school meals sourced from local farms", "A daily meal for every primary student, with at least 40% of produce bought from farms in the district.", P3v1)],
    comments: [
      cm("priya", "Who checks food safety for the smaller suppliers?", "4d", 2),
      cm("ava", "The finance score seems low given the cost of a daily meal at this scale.", "4d", 1),
    ],
  },
  {
    key: "p8", author: "jun", scores: { law: 8, it: 9, finance: 4 }, updated: "6d", following: false, draft: null,
    versions: [v(1, 6, "Initial version", "Digital land registry to reduce property disputes", "Move land titles from paper to a public digital registry, starting where disputes are most common.", P8v1)],
    comments: [cm("lena", "How will people without internet access check their titles?", "5d", 3)],
  },
  {
    key: "p5", author: "maya", scores: { law: 9, finance: 4 }, updated: "7d", following: false,
    draft: { title: "Free legal aid clinics at every district court", summary: "Free first-line legal advice for people who come to court without a lawyer.", body: P5draft, saved: "1d" },
    versions: [v(1, 8, "Initial version", "Free legal aid clinics at every district court", "Free first-line legal advice for people who come to court without a lawyer.", P5v1)],
    comments: [
      cm("daniel", "Would the desks also help with family and tenancy cases? That’s where most unrepresented people are.", "6d", 2, [
        ["maya", "Yes, civil matters broadly. I’ll make that explicit in the next version.", "5d", 1],
      ]),
      cm("sam", "Law students would get valuable experience from this too.", "5d", 3),
    ],
  },
  {
    key: "p4", author: "tomas", scores: { tourism: 9, transport: 4, env: 3, finance: 3 }, updated: "14d", following: false, draft: null,
    versions: [
      v(1, 22, "Initial version", "Heritage trail and visitor centre for the old town", "A signed walking trail through the old town’s listed buildings, with a visitor centre in the former customs house.", P4v1),
      v(2, 16, "Added rationale and site protection measures", "Heritage trail and visitor centre for the old town", "A signed walking trail through the old town’s listed buildings, with a visitor centre in the former customs house.", P4v2),
    ],
    comments: [
      cm("ava", "Moving coach parking will need consultation with shop owners on the main square.", "2w", 2, [
        ["tomas", "Agreed. A session with the traders’ association is planned for next month.", "2w", 0],
      ]),
    ],
  },
  {
    key: "p7", author: "sam", scores: { transport: 9, env: 8, finance: 4 }, updated: "21d", following: false, draft: null,
    versions: [v(1, 24, "Initial version", "Electric bus pilot on two city routes", "Lease 14 electric buses for a year on the two busiest routes and measure cost, reliability and air quality.", P7v1)],
    comments: [],
  },
  {
    key: "p6", author: "maya", scores: { health: 8, it: 7 }, updated: "4d", following: false, versions: [], comments: [],
    draft: { title: "Telemedicine kiosks for rural health centres", summary: "Connect rural nurses and patients to district hospital doctors by video.", body: P6draft, saved: "4d" },
  },
];

// Jev's reading of the sample comments, from the v3 design: [text prefix, kind, relevance 0–100, flag].
// Comments not listed are seeded without an analysis; `npm run comments:analyze` fills them in with Jev.
export const COMMENT_ANALYSIS: [string, string, number, string?][] = [
  ["Phasing makes", "support", 92],
  ["Who maintains the access", "question", 88],
  ["The capital estimate", "concern", 84],
  ["Could some beds", "suggestion", 61],
  ["Does anyone know when", "offtopic", 6],
  ["Typical. Priya", "concern", 30, "Personal attack"],
  ["Cheap bridging loans", "comment", 4, "Spam"],
  ["A register is only useful", "suggestion", 86],
  ["The 30-day deadline", "concern", 80],
  ["Who checks food safety", "question", 74],
  ["The finance score seems low", "concern", 58],
  ["How will people without", "question", 82],
  ["Would the desks also", "question", 85],
  ["Law students would", "support", 64],
  ["Moving coach parking", "concern", 83],
];

// Sample insights from the v3 design: [kind, text, votes, source comment prefixes, answered].
// [kind, text, votes, comment prefixes, answered, relevance (0–100, as Jev judged it against the latest version)]
export const INSIGHTS: Record<string, [string, string, number, string[], boolean, number][]> = {
  p1: [
    ["concern", "No recruitment plan yet for the doctors and nurses the hospital needs", 9, ["Staffing is the real"], false, 91],
    ["concern", "The capital estimate looks low against hospitals built in the last five years", 7, ["The capital estimate"], false, 96],
    ["suggestion", "Reserve some beds for long-term care", 5, ["Could some beds", "Worth a separate"], false, 57],
    ["clarification", "Who maintains the access road after construction?", 4, ["Who maintains the access"], true, 65],
  ],
  p2: [
    ["concern", "A 30-day deadline may be hard for smaller municipalities", 4, ["The 30-day deadline"], false, 82],
    ["suggestion", "Require a standard open data format for published contracts", 3, ["A register is only"], false, 74],
  ],
  p3: [
    ["concern", "The finance score looks low for a daily meal at this scale", 1, ["The finance score"], false, 99],
    ["clarification", "Who checks food safety for the smaller suppliers?", 2, ["Who checks food"], false, 83],
  ],
  p8: [["clarification", "How will people without internet access check their titles?", 3, ["How will people"], false, 88]],
  p5: [["clarification", "Will the desks cover family and tenancy cases?", 2, ["Would the desks"], false, 81]],
  p4: [["concern", "Moving coach parking needs consultation with shop owners on the main square", 2, ["Moving coach parking"], false, 71]],
};

export const DEFAULT_SETTINGS = {
  scale: "10",
  scoredBy: "both",
  requireStream: true,
  showPublic: true,
  defaultLanguage: "en",
  txOnPublish: true,
  txComments: true,
  txLabel: true,
  glossary: ["Insight Pitch", "Jev"] as string[],
};

// Languages switched on in the seed: English (the default) plus Sinhala and Tamil.
export const SEED_LANGUAGES = ["en", "si", "ta"];

export function ageToMs(age: Age): number {
  const m = /^(\d+)([mhdw])$/.exec(age);
  if (!m) throw new Error(`Bad age ${age}`);
  const n = Number(m[1]);
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 }[m[2] as "m" | "h" | "d" | "w"];
  return n * unit;
}

/* Teams, from the v9 design. Members: [person, stream they help with, joined]. Requests and invites: [person, stream, note, age]. */
type SeedTeam = {
  members?: [PersonKey, string | null, Age][];
  mode?: "open" | "roles" | "closed";
  cap?: number;
  roles?: [string, string][];
  requests?: [PersonKey, string | null, string, Age][];
  invites?: [PersonKey, string | null, string, Age][];
  declined?: [PersonKey, Age][];
  offer?: { to: PersonKey; note: string; age: Age };
};
export const TEAMS: Record<string, SeedTeam> = {
  p1: { members: [["ava", "finance", "14d"], ["maya", null, "10d"]], roles: [["transport", "Plan the access road and the bus link to the regional route"]], offer: { to: "maya", note: "I move to the national planning office in November. You know the funding side best.", age: "1d" } },
  p2: { members: [["lena", "it", "13d"]], mode: "open" },
  p3: { mode: "closed" },
  p8: { roles: [["law", "Draft the dispute rules for contested titles"], ["finance", "Estimate the three-year cost"]], requests: [["maya", "law", "I drafted the legal aid proposal and work with the district courts on civil cases.", "2d"]] },
  p5: {
    members: [["daniel", "law", "10d"], ["sam", null, "9d"]], cap: 6,
    roles: [["finance", "Check the coordinator and desk costs, and find a budget line"]],
    requests: [["ava", "finance", "Forty years costing public buildings. Happy to check the coordinator and desk space costs line by line.", "5h"], ["kai", "finance", "add me pls want to be on this", "1h"]],
    invites: [["jun", "it", "Could you advise on a simple case log the desks could share?", "1d"]],
  },
  p4: { roles: [["transport", "Plan coach parking and the shuttle"]], declined: [["maya", "12d"]] },
  p7: { roles: [["finance", "Review the lease terms and the savings estimate"]], invites: [["maya", "finance", "Could you look at the lease and procurement terms before v2?", "3h"]] },
};

export const CHANGE_REQUESTS: { proposal: string; author: PersonKey; base: number; body: string; note: string; age: Age }[] = [
  { proposal: "p5", author: "daniel", base: 1, body: P5dan, note: "Named the case types the desks would cover", age: "2d" },
  { proposal: "p5", author: "sam", base: 1, body: P5sam, note: "Law students to be supervised by a practising lawyer", age: "20h" },
  { proposal: "p1", author: "maya", base: 3, body: P1maya, note: "Named who maintains the access road after construction", age: "1d" },
];
