import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateDrafts } from "../src/core/drafts.mjs";
import { validateLocalAssetManifest } from "../src/core/local-assets.mjs";
import { buildLocalPackage } from "../src/core/package.mjs";
import { createContentPlan, decidePlanItem, revisePlanItem } from "../src/core/planner.mjs";
import { DEFAULT_POLICY } from "../src/core/policy.mjs";
import { buildResearchBacklog } from "../src/core/research-agent.mjs";
import { server } from "../server.mjs";
import { inspectTrackedFile, inspectTrackedPaths } from "../scripts/public-safety-check.mjs";

const now = new Date("2026-10-30T09:00:00Z");
const root = fileURLToPath(new URL("..", import.meta.url));

function backlogWithSource() {
  return buildResearchBacklog({
    ideas: ["A customer outcome needs a clear owner"],
    sources: [{
      title: "Synthetic reference",
      url: "https://example.com/reference",
      note: "Synthetic note for a deterministic test.",
      allowedForDrafting: true,
    }],
  }, now);
}

function approvedPlan() {
  const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 1, postsPerWeek: 1 }, now);
  revisePlanItem(plan, plan.items[0].planItemId, {
    evidenceConfirmed: true,
  }, now);
  return decidePlanItem(plan, plan.items[0].planItemId, "approve", { actorLabel: "tester" }, now);
}

function draftSet() {
  const plan = approvedPlan();
  return generateDrafts({
    planItem: plan.items[0],
    evidence: [{ text: "A synthetic confirmed thesis", source: "https://example.com/reference", confirmed: true }],
    tags: ["leadership", "customer-outcome", "banned"],
    cta: "What signal do you use?",
    policy: {
      ...structuredClone(DEFAULT_POLICY),
      policyVersion: "test-v1",
      telegram: {
        ...DEFAULT_POLICY.telegram,
        bannedTags: ["banned"],
      },
    },
  }, now);
}

describe("research backlog", () => {
  test("keeps source provenance and does not claim external browsing", () => {
    const backlog = backlogWithSource();
    assert.equal(backlog.mode, "manual-seed");
    assert.equal(backlog.agentReceipt.externalBrowsingPerformed, false);
    assert.equal(backlog.items[0].evidenceStatus, "sources_attached");
    assert.deepEqual(backlog.items[0].sourceIds, [backlog.sources[0].sourceId]);
  });

  test("marks an owner idea without sources as needing evidence", () => {
    const backlog = buildResearchBacklog({ ideas: ["An unsourced owner idea"], sources: [] }, now);
    assert.equal(backlog.items[0].evidenceStatus, "needs_sources");
  });
});

describe("planning and approval", () => {
  test("creates exactly the requested one-to-five-week horizon", () => {
    const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 5, postsPerWeek: 3 }, now);
    assert.equal(plan.horizonWeeks, 5);
    assert.equal(plan.items.length, 15);
    assert.equal(plan.items.at(-1).week, 5);
  });

  test("creates and exposes every selected week", () => {
    const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 2, postsPerWeek: 2 }, now);
    assert.equal(plan.horizonWeeks, 2);
    assert.deepEqual([...new Set(plan.items.map((item) => item.week))], [1, 2]);
    assert.equal(plan.items.filter((item) => item.week === 1).length, 2);
    assert.equal(plan.items.filter((item) => item.week === 2).length, 2);
  });

  test("rejects a horizon outside one to five weeks", () => {
    assert.throws(
      () => createContentPlan({ backlog: backlogWithSource(), weeks: 6, postsPerWeek: 1 }, now),
      /не прошёл входную проверку/,
    );
  });

  test("does not approve an item without an allowed source", () => {
    const backlog = buildResearchBacklog({ ideas: ["Unsourced idea"], sources: [] }, now);
    const plan = createContentPlan({ backlog, weeks: 1, postsPerWeek: 1 }, now);
    assert.throws(
      () => decidePlanItem(plan, plan.items[0].planItemId, "approve", {}, now),
      /без фактуры, источника и подтверждения человека/,
    );
  });

  test("does not treat an attached source as confirmed factual basis", () => {
    const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 1, postsPerWeek: 1 }, now);
    assert.equal(plan.items[0].evidenceStatus, "needs_human_check");
    assert.match(plan.items[0].evidence.factSummary, /Synthetic note/);
    assert.throws(
      () => decidePlanItem(plan, plan.items[0].planItemId, "approve", {}, now),
      /без фактуры, источника и подтверждения человека/,
    );
  });

  test("approves only after a human confirms the factual basis", () => {
    const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 1, postsPerWeek: 1 }, now);
    revisePlanItem(plan, plan.items[0].planItemId, {
      evidenceConfirmed: true,
    }, now);
    assert.equal(plan.items[0].evidenceStatus, "fact_checked");
    decidePlanItem(plan, plan.items[0].planItemId, "approve", {}, now);
    assert.equal(plan.items[0].status, "approved");
  });

  test("invalidates stale confirmation when factual content changes", () => {
    const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 1, postsPerWeek: 1 }, now);
    const item = plan.items[0];
    revisePlanItem(plan, item.planItemId, { evidenceConfirmed: true }, now);
    assert.equal(item.evidenceStatus, "fact_checked");

    revisePlanItem(plan, item.planItemId, {
      factSummary: "A changed claim that has not been re-confirmed",
      evidenceConfirmed: true,
    }, now);
    assert.equal(item.evidenceStatus, "needs_human_check");
    assert.equal(item.evidence.confirmedByHuman, false);
    assert.throws(
      () => decidePlanItem(plan, item.planItemId, "approve", {}, now),
      /без фактуры, источника и подтверждения человека/,
    );

    revisePlanItem(plan, item.planItemId, { evidenceConfirmed: true }, now);
    decidePlanItem(plan, item.planItemId, "approve", {}, now);
    assert.equal(item.status, "approved");
  });

  test("manual revision invalidates a previous approval", () => {
    const plan = approvedPlan();
    revisePlanItem(plan, plan.items[0].planItemId, { topic: "Edited topic", angle: "Edited angle" }, now);
    assert.equal(plan.items[0].status, "draft");
    assert.equal(plan.items[0].humanDecision.decision, "edited");
  });
});

describe("five platform drafts", () => {
  test("requires an approved plan item", () => {
    const plan = createContentPlan({ backlog: backlogWithSource(), weeks: 1, postsPerWeek: 1 }, now);
    assert.throws(
      () => generateDrafts({ planItem: plan.items[0], evidence: [], policy: DEFAULT_POLICY }, now),
      /утверждённой человеком/,
    );
  });

  test("generates five drafts in the fixed order and keeps publication disabled", () => {
    const result = draftSet();
    assert.deepEqual(result.platformOrder, ["instagram", "vkontakte", "telegram", "max", "linkedin"]);
    assert.deepEqual(Object.keys(result.drafts), result.platformOrder);
    assert.equal(result.publicationAuthorized, false);
  });

  test("uses policy configuration and removes banned Telegram tags", () => {
    const result = draftSet();
    assert.match(result.drafts.telegram.text, /example\.com\/channel/);
    assert.doesNotMatch(result.drafts.telegram.text, /#banned/i);
    assert.match(result.drafts.instagram.text, /#leadership/);
  });
});

describe("local-only assets and package", () => {
  test("accepts local manifest references without embedded media", () => {
    const value = validateLocalAssetManifest({
      assets: [{ kind: "photo", localReference: "portrait-local.jpg", rightsConfirmed: true }],
    });
    assert.equal(value.transport, "local-only");
    assert.equal(value.embeddedMedia, false);
  });

  test("rejects embedded media and credential-shaped fields", () => {
    assert.throws(
      () => validateLocalAssetManifest({
        token: "x",
        assets: [{ localReference: "portrait", rightsConfirmed: true, data: "data:image/png;base64,abc" }],
      }),
      /не прошёл проверку/,
    );
  });

  test("packages only approved drafts with author attestation and no publication", () => {
    const plan = approvedPlan();
    const drafts = draftSet();
    const edited = Object.fromEntries(
      Object.entries(drafts.drafts).map(([platform, item]) => [platform, item.text]),
    );
    const value = buildLocalPackage({
      backlog: backlogWithSource(),
      plan,
      draftSet: drafts,
      editedDrafts: edited,
      authorAttestation: true,
    }, now);
    assert.equal(value.manifest.publicationAuthorized, false);
    assert.equal(value.manifest.includesMedia, false);
    assert.deepEqual(Object.keys(value.posts), drafts.platformOrder);
  });

  test("refuses a package without author attestation", () => {
    const plan = approvedPlan();
    const drafts = draftSet();
    const edited = Object.fromEntries(
      Object.entries(drafts.drafts).map(([platform, item]) => [platform, item.text]),
    );
    assert.throws(
      () => buildLocalPackage({ plan, draftSet: drafts, editedDrafts: edited, authorAttestation: false }, now),
      /не прошёл проверку/,
    );
  });
});

describe("public repository boundary", () => {
  test("contains no committed media, office documents, fonts or archives", async () => {
    const forbidden = new Set([
      ".docx", ".pptx", ".pdf", ".zip", ".jpg", ".jpeg", ".png", ".webp",
      ".mp3", ".wav", ".mp4", ".mov", ".glb", ".fbx", ".otf", ".ttf",
    ]);
    async function walk(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        if (entry.name === ".git") continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await walk(path));
        else result.push(path);
      }
      return result;
    }
    const paths = await walk(root);
    assert.deepEqual(paths.filter((path) => forbidden.has(path.slice(path.lastIndexOf(".")).toLowerCase())), []);
  });

  test("does not contain known private content markers", async () => {
    const paths = [
      "README.md", "public/index.html", "public/app.js", "src/core/policy.mjs",
      "examples/synthetic-workspace.json",
    ];
    const text = (await Promise.all(paths.map((path) => readFile(join(root, path), "utf8")))).join("\n");
    assert.doesNotMatch(text, /channel_olkhova|page_bfa2e|\/Users\/|t\.me\/\+/i);
  });

  test("rejects a force-tracked file inside every local/private directory", async () => {
    const guarded = [
      "local-assets/photo.json",
      "local-data/customer.json",
      "private/brief.md",
      "exports/package.json",
      "generated/post.md",
    ];
    const issues = await inspectTrackedPaths(guarded, root);
    assert.equal(issues.length, guarded.length);
    for (const path of guarded) {
      assert.ok(issues.some((issue) => issue.startsWith(path)));
    }
  });

  test("scans tracked text regardless of extension and blocks design or binary files", () => {
    const markerName = ["to", "ken"].join("");
    const markerValue = ["synthetic", "private", "value"].join("-");
    const marker = Buffer.from(`${markerName} = '${markerValue}'`, "utf8");
    for (const path of ["notes.txt", "data.csv", "config.toml", "script.ts"]) {
      const issues = inspectTrackedFile(path, marker);
      assert.ok(issues.some((issue) => issue.startsWith(path) && issue.includes("matched")));
    }
    assert.ok(inspectTrackedFile("logo.svg", Buffer.from("<svg></svg>")).some((issue) => issue.includes("forbidden extension")));
    assert.ok(inspectTrackedFile("unknown.bin", Buffer.from([0, 1, 2])).some((issue) => issue.includes("binary content")));
  });
});

describe("local server", () => {
  let origin;
  let listenError;
  before(async () => {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error.code === "EPERM") {
          listenError = error;
          resolve();
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        origin = `http://127.0.0.1:${address.port}`;
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
  });
  after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });

  test("reports a local mock health boundary", async (context) => {
    if (listenError) return context.skip("Sandbox forbids local listening; run outside sandbox or in CI.");
    const response = await fetch(`${origin}/api/health`);
    const value = await response.json();
    assert.equal(response.status, 200);
    assert.equal(value.bind, "127.0.0.1");
    assert.equal(value.publicationAuthorized, false);
    assert.equal(value.stages.threeD, "disabled");
  });

  test("serves the local workbench", async (context) => {
    if (listenError) return context.skip("Sandbox forbids local listening; run outside sandbox or in CI.");
    const response = await fetch(origin);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, /Content Factory/);
  });
});
