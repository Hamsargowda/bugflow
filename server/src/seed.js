import "dotenv/config";
import { pool } from "./db.js";
import bcrypt from "bcryptjs";
import { computePriorityScore } from "./matcher.js";

/* Same relative-date helper the original artifact used, so seed data still
   looks "live" (recent) no matter when you run this script. */
function offsetDate(daysBack, hourOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(d.getHours() - hourOffset, 0, 0, 0);
  return d.toISOString();
}

let uid = 0;
function nextId(prefix) {
  uid += 1;
  return `${prefix}${uid}`;
}

function mkActivity(type, text, at, actor) {
  return { id: nextId("act"), type, text, at, actor };
}
function mkComment(author, text, at) {
  return { id: nextId("cmt"), author, text, at };
}

const SEED_ISSUES = [
  {
    id: "BUG-1042", project: "Checkout & Payments", title: "Payment fails silently when card is declined",
    description: "When a customer's card is declined at checkout, the payment fails but no error message is shown — the spinner just disappears and the cart empties, causing data loss on the order. Reported as a security concern by finance since totals don't reconcile.",
    severity: "Critical", priority: "P0 - Urgent", module: "Payments Gateway", environment: "Production", category: "Backend Logic",
    reporter: "Sofia Torres", assignee: "Marcus Webb", status: "In Progress", tags: ["payments", "regression"], inSprint: true,
    createdAt: offsetDate(6), updatedAt: offsetDate(0, 4), resolvedAt: null,
    comments: [
      mkComment("Marcus Webb", "Reproduced on staging. Looks like the decline webhook isn't updating order state.", offsetDate(5)),
      mkComment("Sofia Torres", "Confirmed with finance — 14 orders affected this week.", offsetDate(3)),
    ],
    activity: [
      mkActivity("created", "Issue created", offsetDate(6), "Sofia Torres"),
      mkActivity("status", "Status changed to Triaged", offsetDate(5, 12), "Marcus Webb"),
      mkActivity("assign", "Assigned to Marcus Webb", offsetDate(5, 10), "Priya Nair"),
      mkActivity("status", "Status changed to In Progress", offsetDate(4), "Marcus Webb"),
    ],
  },
  {
    id: "BUG-1041", project: "BugFlow Core", title: "Login button unresponsive on Safari",
    description: "Clicking Sign In on Safari 17 does nothing on first click; works on second click. Users think the app is broken.",
    severity: "High", priority: "P1 - High", module: "Authentication", environment: "Production", category: "Security Vulnerability",
    reporter: "Diego Alvarez", assignee: "Priya Nair", status: "In Review", tags: ["safari", "auth"], inSprint: true,
    createdAt: offsetDate(9), updatedAt: offsetDate(1), resolvedAt: null,
    comments: [mkComment("Priya Nair", "Fix is up — event listener was attached before hydration completed.", offsetDate(1))],
    activity: [
      mkActivity("created", "Issue created", offsetDate(9), "Diego Alvarez"),
      mkActivity("status", "Status changed to In Progress", offsetDate(7), "Priya Nair"),
      mkActivity("status", "Status changed to In Review", offsetDate(1), "Priya Nair"),
    ],
  },
  {
    id: "BUG-1040", project: "Mobile Apps", title: "App crashes on opening notification settings",
    description: "Tapping Notification Settings on Android crashes the app immediately with a null pointer exception in the preferences module.",
    severity: "Critical", priority: "P0 - Urgent", module: "Mobile UI", environment: "Production", category: "UI Glitch",
    reporter: "Emily Zhang", assignee: "Han Ji-woo", status: "Triaged", tags: ["android", "crash"], inSprint: true,
    createdAt: offsetDate(4), updatedAt: offsetDate(4), resolvedAt: null,
    comments: [],
    activity: [mkActivity("created", "Issue created", offsetDate(4), "Emily Zhang"), mkActivity("status", "Status changed to Triaged", offsetDate(3), "Han Ji-woo")],
  },
  {
    id: "BUG-1039", project: "BugFlow Core", title: "Search results are slow for queries over 20 characters",
    description: "Search takes 4-6 seconds to return results when the query string is long. Intermittent, not consistent across all long queries.",
    severity: "Medium", priority: "P2 - Medium", module: "Search", environment: "Production", category: "Backend Logic",
    reporter: "Priya Nair", assignee: "Diego Alvarez", status: "Open", tags: ["performance"], inSprint: false,
    createdAt: offsetDate(2), updatedAt: offsetDate(2), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(2), "Priya Nair")],
  },
  {
    id: "BUG-1038", project: "Checkout & Payments", title: "Tax total mismatch on international orders",
    description: "For orders shipping outside the US, the displayed tax total is inconsistent with the tax on the emailed receipt.",
    severity: "High", priority: "P1 - High", module: "Payments Gateway", environment: "Production", category: "Backend Logic",
    reporter: "Sofia Torres", assignee: "Marcus Webb", status: "Open", tags: ["billing", "international"], inSprint: false,
    createdAt: offsetDate(1), updatedAt: offsetDate(1), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(1), "Sofia Torres")],
  },
  {
    id: "BUG-1037", project: "BugFlow Core", title: "Dashboard widgets misaligned on 13-inch screens",
    description: "Minor cosmetic issue — the analytics widgets overlap slightly on 13-inch laptop resolutions. Spacing looks off.",
    severity: "Low", priority: "P3 - Low", module: "Dashboard UI", environment: "Production", category: "UI Glitch",
    reporter: "Emily Zhang", assignee: "Han Ji-woo", status: "Resolved", tags: ["css", "cosmetic"], inSprint: true,
    createdAt: offsetDate(11), updatedAt: offsetDate(8), resolvedAt: offsetDate(8),
    comments: [mkComment("Han Ji-woo", "Fixed with a grid breakpoint at 1024px.", offsetDate(8))],
    activity: [
      mkActivity("created", "Issue created", offsetDate(11), "Emily Zhang"),
      mkActivity("status", "Status changed to In Progress", offsetDate(10), "Han Ji-woo"),
      mkActivity("status", "Status changed to Resolved", offsetDate(8), "Han Ji-woo"),
    ],
  },
  {
    id: "BUG-1036", project: "Mobile Apps", title: "Push notifications delayed by up to 10 minutes",
    description: "Notifications for new messages arrive several minutes late, sometimes bundled together instead of individually.",
    severity: "Medium", priority: "P2 - Medium", module: "Notifications", environment: "Production", category: "Backend Logic",
    reporter: "Diego Alvarez", assignee: "Emily Zhang", status: "In Progress", tags: ["notifications"], inSprint: true,
    createdAt: offsetDate(7), updatedAt: offsetDate(2), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(7), "Diego Alvarez"), mkActivity("assign", "Assigned to Emily Zhang", offsetDate(6), "Priya Nair")],
  },
  {
    id: "BUG-1035", project: "BugFlow Core", title: "API Gateway returns 500 on malformed pagination params",
    description: "Passing a negative page number to the /issues endpoint returns an unhandled 500 error exception instead of a 400.",
    severity: "High", priority: "P1 - High", module: "API Gateway", environment: "Staging", category: "API Gateway",
    reporter: "Marcus Webb", assignee: "Priya Nair", status: "Closed", tags: ["api", "validation"], inSprint: true,
    createdAt: offsetDate(14), updatedAt: offsetDate(10), resolvedAt: offsetDate(11),
    comments: [mkComment("Priya Nair", "Added param validation middleware, covered with tests.", offsetDate(11))],
    activity: [
      mkActivity("created", "Issue created", offsetDate(14), "Marcus Webb"),
      mkActivity("status", "Status changed to In Progress", offsetDate(13), "Priya Nair"),
      mkActivity("status", "Status changed to Resolved", offsetDate(11), "Priya Nair"),
      mkActivity("status", "Status changed to Closed", offsetDate(10), "Sofia Torres"),
    ],
  },
  {
    id: "BUG-1034", project: "Checkout & Payments", title: "Coupon code field accepts trailing spaces silently",
    description: "Cosmetic/UX issue — pasting a coupon code with a trailing space shows 'invalid code' with no indication of why.",
    severity: "Low", priority: "P3 - Low", module: "Payments Gateway", environment: "Production", category: "Backend Logic",
    reporter: "Emily Zhang", assignee: "Unassigned", status: "Open", tags: ["ux"], inSprint: false,
    createdAt: offsetDate(3), updatedAt: offsetDate(3), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(3), "Emily Zhang")],
  },
  {
    id: "BUG-1033", project: "Mobile Apps", title: "Sync engine drops offline edits on reconnect",
    description: "When a device reconnects after being offline, some locally edited records are silently overwritten by the server copy — data loss for the user.",
    severity: "Critical", priority: "P0 - Urgent", module: "Sync Engine", environment: "Production", category: "Database Error",
    reporter: "Han Ji-woo", assignee: "Diego Alvarez", status: "In Review", tags: ["sync", "data-loss"], inSprint: true,
    createdAt: offsetDate(8), updatedAt: offsetDate(1), resolvedAt: null,
    comments: [
      mkComment("Diego Alvarez", "Root cause: last-write-wins without a conflict check. Building a merge strategy.", offsetDate(4)),
      mkComment("Han Ji-woo", "Please add a regression test for the offline-edit scenario.", offsetDate(2)),
    ],
    activity: [
      mkActivity("created", "Issue created", offsetDate(8), "Han Ji-woo"),
      mkActivity("status", "Status changed to Triaged", offsetDate(7), "Diego Alvarez"),
      mkActivity("status", "Status changed to In Progress", offsetDate(6), "Diego Alvarez"),
      mkActivity("status", "Status changed to In Review", offsetDate(1), "Diego Alvarez"),
    ],
  },
  {
    id: "BUG-1032", project: "BugFlow Core", title: "Onboarding checklist doesn't persist completed steps",
    description: "Refreshing the page during onboarding resets the checklist progress, forcing users to redo completed steps.",
    severity: "Medium", priority: "P2 - Medium", module: "Onboarding", environment: "Production", category: "UI Glitch",
    reporter: "Priya Nair", assignee: "Han Ji-woo", status: "Resolved", tags: ["onboarding"], inSprint: true,
    createdAt: offsetDate(13), updatedAt: offsetDate(9), resolvedAt: offsetDate(9),
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(13), "Priya Nair"), mkActivity("status", "Status changed to Resolved", offsetDate(9), "Han Ji-woo")],
  },
  {
    id: "BUG-1031", project: "Checkout & Payments", title: "Refund report totals exclude partial refunds",
    description: "The reporting export undercounts refunds because partial refunds aren't summed correctly, causing mismatch with accounting.",
    severity: "High", priority: "P1 - High", module: "Reporting", environment: "Production", category: "Database Error",
    reporter: "Sofia Torres", assignee: "Marcus Webb", status: "Closed", tags: ["reporting", "billing"], inSprint: true,
    createdAt: offsetDate(18), updatedAt: offsetDate(14), resolvedAt: offsetDate(15),
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(18), "Sofia Torres"), mkActivity("status", "Status changed to Resolved", offsetDate(15), "Marcus Webb"), mkActivity("status", "Status changed to Closed", offsetDate(14), "Sofia Torres")],
  },
  {
    id: "BUG-1030", project: "BugFlow Core", title: "Admin panel role dropdown shows deleted users",
    description: "Deleted team members still appear as assignable in the Admin Panel role dropdown, which is confusing but not blocking.",
    severity: "Low", priority: "P3 - Low", module: "Admin Panel", environment: "Staging", category: "UI Glitch",
    reporter: "Han Ji-woo", assignee: "Unassigned", status: "Open", tags: ["admin"], inSprint: false,
    createdAt: offsetDate(0), updatedAt: offsetDate(0), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(0), "Han Ji-woo")],
  },
  {
    id: "BUG-1029", project: "Mobile Apps", title: "Dark mode toggle resets to light mode after app restart",
    description: "User preference for dark mode isn't persisted; every time the app is force-closed, it reverts to light mode on next launch.",
    severity: "Medium", priority: "P2 - Medium", module: "Mobile UI", environment: "Production", category: "UI Glitch",
    reporter: "Emily Zhang", assignee: "Han Ji-woo", status: "In Progress", tags: ["preferences", "mobile"], inSprint: true,
    createdAt: offsetDate(5), updatedAt: offsetDate(1), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(5), "Emily Zhang"), mkActivity("assign", "Assigned to Han Ji-woo", offsetDate(4), "Priya Nair")],
  },
  {
    id: "BUG-1028", project: "Checkout & Payments", title: "Duplicate order confirmation emails sent",
    description: "Some customers receive two identical order confirmation emails a few seconds apart. Appears related to a webhook retry.",
    severity: "Medium", priority: "P2 - Medium", module: "Notifications", environment: "Production", category: "Backend Logic",
    reporter: "Diego Alvarez", assignee: "Sofia Torres", status: "Triaged", tags: ["email"], inSprint: false,
    createdAt: offsetDate(1, 6), updatedAt: offsetDate(1), resolvedAt: null,
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(1, 6), "Diego Alvarez")],
  },
  {
    id: "BUG-1027", project: "BugFlow Core", title: "Exception thrown when exporting empty issue list to CSV",
    description: "Clicking export on a fully filtered (empty) issue list throws an unhandled exception in the console instead of showing a friendly message.",
    severity: "Low", priority: "P3 - Low", module: "Reporting", environment: "Development", category: "Database Error",
    reporter: "Marcus Webb", assignee: "Priya Nair", status: "Closed", tags: ["export"], inSprint: true,
    createdAt: offsetDate(16), updatedAt: offsetDate(12), resolvedAt: offsetDate(13),
    comments: [], activity: [mkActivity("created", "Issue created", offsetDate(16), "Marcus Webb"), mkActivity("status", "Status changed to Resolved", offsetDate(13), "Priya Nair"), mkActivity("status", "Status changed to Closed", offsetDate(12), "Marcus Webb")],
  },
];

async function ensureAndSeedUsers(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Developer', 'Tester', 'Project Manager', 'Admin', 'User', 'Triager', 'Stakeholder')),
      core_skills TEXT[] NOT NULL DEFAULT '{}',
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Belt-and-suspenders: add the column if this DB was created before core_skills existed.
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS core_skills TEXT[] NOT NULL DEFAULT '{}'`);
  // Belt-and-suspenders: widen the role check if this DB predates the "User" role.
  await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await client.query(
    `ALTER TABLE users ADD CONSTRAINT users_role_check
       CHECK (role IN ('Developer', 'Tester', 'Project Manager', 'Admin', 'User', 'Triager', 'Stakeholder'))`
  );

  const users = [
    ['USR-DEV',    'developer', 'Dev User',        'Developer',        ['JavaScript', 'React', 'Frontend']],
    ['USR-DEV2',   'alice',     'Alice Chen',       'Developer',        ['React', 'CSS', 'Frontend']],
    ['USR-DEV3',   'john',      'John Park',        'Developer',        ['Python', 'PostgreSQL', 'Backend', 'Database']],
    ['USR-DEV4',   'maria',     'Maria Silva',      'Developer',        ['Security', 'Authentication', 'API']],
    ['USR-DEV5',   'kenji',     'Kenji Sato',       'Developer',        ['Mobile', 'React', 'Sync']],
    ['USR-TEST',   'tester',    'Test User',        'Tester',           []],
    ['USR-PM',     'manager',   'Project Manager',  'Project Manager',  []],
    ['USR-ADMIN',  'admin',     'Admin User',       'Admin',            []],
    ['USR-USER',   'user',      'Reporter User',    'User',             []],
    ['USR-TRIAGER', 'triager',  'Triage User',     'Triager',         ['Backend', 'Database', 'API']],
    ['USR-STAKE',   'stakeholder','Stakeholder User','Stakeholder',      []],
  ];
  for (const [id, username, displayName, role, skills] of users) {
    const hash = await bcrypt.hash('BugFlow@123', 10);
    await client.query(
      `INSERT INTO users (id, username, display_name, role, core_skills, password_hash, active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name, role=EXCLUDED.role,
         core_skills=EXCLUDED.core_skills, password_hash=EXCLUDED.password_hash, active=TRUE`,
      [id, username, displayName, role, skills, hash]
    );
  }
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureAndSeedUsers(client);
    await client.query("TRUNCATE notifications, attachments, activity, comments, issue_tags, issues, sprints RESTART IDENTITY CASCADE");

    // Seed two demo sprints so the Milestone 2 Sprint Board isn't empty on first load.
    const sprintNow = new Date();
    const sprintEnd = new Date(sprintNow); sprintEnd.setDate(sprintEnd.getDate() + 14);
    await client.query(
      `INSERT INTO sprints (id, name, goal, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
      ["SPRINT-1", "Sprint 1 - Foundation", "Stabilize checkout and mobile crash issues", sprintNow.toISOString().slice(0, 10), sprintEnd.toISOString().slice(0, 10)]
    );

    for (const issue of SEED_ISSUES) {
      const priorityScore = computePriorityScore(issue.severity, issue.category);
      await client.query(
        `INSERT INTO issues
          (id, project, title, description, severity, priority, module, environment, category, priority_score,
           reporter, assignee, status, in_sprint, created_at, updated_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          issue.id, issue.project, issue.title, issue.description, issue.severity, issue.priority,
          issue.module, issue.environment, issue.category, priorityScore, issue.reporter, issue.assignee, issue.status,
          issue.inSprint, issue.createdAt, issue.updatedAt, issue.resolvedAt,
        ]
      );

      for (const tag of issue.tags) {
        await client.query(`INSERT INTO issue_tags (issue_id, tag) VALUES ($1,$2)`, [issue.id, tag]);
      }
      for (const c of issue.comments) {
        await client.query(
          `INSERT INTO comments (id, issue_id, author, text, at) VALUES ($1,$2,$3,$4,$5)`,
          [c.id, issue.id, c.author, c.text, c.at]
        );
      }
      for (const a of issue.activity) {
        await client.query(
          `INSERT INTO activity (id, issue_id, type, text, at, actor) VALUES ($1,$2,$3,$4,$5,$6)`,
          [a.id, issue.id, a.type, a.text, a.at, a.actor]
        );
      }
    }

    await client.query(
      `UPDATE issues SET sprint_id = 'SPRINT-1' WHERE id IN ('BUG-1042','BUG-1041','BUG-1040','BUG-1039')`
    );

    await client.query("COMMIT");
    console.log(`Seeded ${SEED_ISSUES.length} issues and 1 sprint.`);
    console.log("Demo logins (password BugFlow@123): developer, alice, john, maria, kenji (Developers) · tester · manager · admin · user");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
