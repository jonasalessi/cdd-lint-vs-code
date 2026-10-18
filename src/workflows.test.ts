import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = {
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
};

type Job = {
  needs?: string | string[];
  "runs-on": string;
  permissions?: Record<string, string>;
  steps: Step[];
};

type Workflow = {
  on: { push?: { tags?: string[] } };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
};

const secretExpression = "${{ secrets.VSCE_PAT }}";

function readWorkflow(fileName: string): Workflow {
  const workflowPath = resolve(__dirname, "..", ".github", "workflows", fileName);
  return parse(readFileSync(workflowPath, "utf8")) as Workflow;
}

function jobOf(workflow: Workflow, jobName: string): Job {
  const job = workflow.jobs[jobName];
  if (job === undefined) {
    throw new Error(`The workflow has no job ${jobName}.`);
  }
  return job;
}

function runsOf(job: Job): string[] {
  return job.steps.map((step) => step.run ?? "");
}

function indexOfRun(job: Job, command: string): number {
  return runsOf(job).findIndex((run) => run.includes(command));
}

function stepWithRun(job: Job, command: string): Step {
  const step = job.steps[indexOfRun(job, command)];
  if (step === undefined) {
    throw new Error(`The job has no step that runs ${command}.`);
  }
  return step;
}

const node24ActionMajors: Record<string, number> = {
  "actions/checkout": 5,
  "actions/setup-node": 5,
  "actions/upload-artifact": 6,
  "actions/download-artifact": 7,
};

function actionsOf(workflow: Workflow): string[] {
  return Object.values(workflow.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses])),
  );
}

function runsOnNode20(action: string): boolean {
  const [name = "", version = ""] = action.split("@");
  const minimumMajor = node24ActionMajors[name] ?? 0;
  return Number(version.replace(/^v/, "").split(".")[0]) < minimumMajor;
}

describe.each(["ci.yml", "release.yml"])("%s actions", (fileName) => {
  it("use only majors that run on Node.js 24", () => {
    expect(actionsOf(readWorkflow(fileName)).filter(runsOnNode20)).toEqual([]);
  });
});

function jobsWithWritePermission(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs)
    .filter(([, job]) => Object.values(job.permissions ?? {}).includes("write"))
    .map(([jobName]) => jobName);
}

describe("ci.yml", () => {
  const workflow = readWorkflow("ci.yml");

  it("is valid YAML with a verify job", () => {
    expect(jobOf(workflow, "verify").steps).not.toHaveLength(0);
  });
});

describe("release.yml", () => {
  const workflow = readWorkflow("release.yml");
  const release = jobOf(workflow, "release");
  const publish = jobOf(workflow, "publish-marketplace");

  it("starts on a tag v*", () => {
    expect(workflow.on.push?.tags).toEqual(["v*"]);
  });

  it("gives write permission only to the job that uploads the VSIX", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(jobsWithWritePermission(workflow)).toEqual(["release"]);
    expect(release.permissions).toEqual({ contents: "write" });
  });

  it("compares the tag with the version of package.json before npm ci", () => {
    const tagCheckIndex = indexOfRun(release, 'if [ "$GITHUB_REF_NAME" != "v$version" ]');
    expect(tagCheckIndex).toBeGreaterThanOrEqual(0);
    expect(tagCheckIndex).toBeLessThan(indexOfRun(release, "npm ci"));
    expect(release.steps[tagCheckIndex]?.run).toContain("exit 1");
  });

  it("runs npm ci, fetch-cdd and verify in this order on ubuntu-latest", () => {
    const order = ["npm ci", "scripts/fetch-cdd.mjs", "xvfb-run -a npm run verify"].map((command) =>
      indexOfRun(release, command),
    );
    expect(release["runs-on"]).toBe("ubuntu-latest");
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((first, second) => first - second));
  });

  it("uploads the VSIX to the GitHub Release after verify", () => {
    const uploadIndex = indexOfRun(release, 'gh release upload "$GITHUB_REF_NAME" "$VSIX"');
    expect(uploadIndex).toBeGreaterThan(indexOfRun(release, "npm run verify"));
    expect(stepWithRun(release, 'echo "vsix=cdd-lint-vscode-$version.vsix"').id).toBe("version");
  });

  it("runs publish-marketplace after the release job", () => {
    expect(publish.needs).toBe("release");
  });

  it("reads VSCE_PAT into an environment variable in the first step of publish-marketplace", () => {
    const firstStep = publish.steps[0];
    expect(firstStep?.id).toBe("token");
    expect(firstStep?.env).toEqual({ VSCE_PAT: secretExpression });
    expect(firstStep?.run).toContain('echo "available=true" >> "$GITHUB_OUTPUT"');
  });

  it("publishes only when the step output says that VSCE_PAT is set", () => {
    const publishStep = stepWithRun(publish, "vsce publish --packagePath");
    expect(publishStep.if).toBe("steps.token.outputs.available == 'true'");
  });

  it("uses no secret in an if expression", () => {
    const conditions = [release, publish].flatMap((job) => job.steps.map((step) => step.if ?? ""));
    expect(conditions.filter((condition) => condition.includes("secrets"))).toEqual([]);
  });
});
