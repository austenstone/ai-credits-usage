import {
  debug,
  getBooleanInput,
  getInput,
  info,
  setOutput,
  warning,
} from "@actions/core";
import { getOctokit } from "@actions/github";
import { DefaultArtifactClient } from "@actions/artifact";
import { writeFileSync } from "fs";
import { json2csv } from "json-2-csv";
import { writeJobSummary } from "./job-summary";

export interface UsageItem {
  date: string;
  product: string;
  sku: string;
  quantity: number;
  unitType: string;
  pricePerUnit: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  organizationName?: string;
  repositoryName?: string;
  username?: string;
}

interface UsageResponse {
  usageItems: UsageItem[];
}

interface Input {
  token: string;
  enterprise: string;
  organization: string;
  costCenter: string;
  year: number;
  month?: number;
  day?: number;
  hour?: number;
  jobSummary: boolean;
  json: boolean;
  csv: boolean;
  artifactName: string;
  pricePerCredit: number;
}

const getInputs = (): Input => {
  const token = getInput("github-token", { required: true }).trim();
  const enterprise = getInput("enterprise").trim();
  const organization = getInput("organization").trim();
  const costCenter = getInput("cost-center").trim();

  if (!enterprise && !organization && !costCenter) {
    throw new Error("One of `enterprise`, `organization`, or `cost-center` is required.");
  }
  if (costCenter && !enterprise) {
    throw new Error("`cost-center` requires `enterprise` to also be set.");
  }

  const num = (key: string): number | undefined => {
    const raw = getInput(key);
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) throw new Error(`Input \`${key}\` must be a number, got: ${raw}`);
    return n;
  };

  return {
    token,
    enterprise,
    organization,
    costCenter,
    year: num("year") ?? new Date().getUTCFullYear(),
    month: num("month"),
    day: num("day"),
    hour: num("hour"),
    jobSummary: getBooleanInput("job-summary"),
    json: getBooleanInput("json"),
    csv: getBooleanInput("csv"),
    artifactName: getInput("artifact-name") || "ai-credits-usage",
    pricePerCredit: parseFloat(getInput("price-per-credit") || "0.04"),
  };
};

const isAiuItem = (item: UsageItem): boolean => {
  const product = (item.product || "").toLowerCase();
  const sku = (item.sku || "").toLowerCase();
  const unit = (item.unitType || "").toLowerCase();
  // AIUs (a.k.a. GitHub AI Credits, fka PRUs) ride on the copilot product
  // and surface in SKU/unitType as some form of "credit", "aiu", "premium", or "token".
  const aiuSignal = /(credit|aiu|premium|token)/i;
  return product.includes("copilot") && (aiuSignal.test(sku) || aiuSignal.test(unit));
};

const run = async (): Promise<void> => {
  const input = getInputs();
  const octokit = getOctokit(input.token);

  const params: Record<string, number> = { year: input.year };
  if (input.month !== undefined) params.month = input.month;
  if (input.day !== undefined) params.day = input.day;
  if (input.hour !== undefined) params.hour = input.hour;

  let route: string;
  let routeParams: Record<string, string | number>;

  if (input.costCenter) {
    info(`Fetching billing usage for cost center ${input.costCenter} in enterprise ${input.enterprise}`);
    route = "GET /enterprises/{enterprise}/settings/billing/usage/{cost_center_id}";
    routeParams = { enterprise: input.enterprise, cost_center_id: input.costCenter, ...params };
  } else if (input.enterprise) {
    info(`Fetching billing usage for enterprise ${input.enterprise}`);
    route = "GET /enterprises/{enterprise}/settings/billing/usage";
    routeParams = { enterprise: input.enterprise, ...params };
  } else {
    info(`Fetching billing usage for organization ${input.organization}`);
    route = "GET /organizations/{org}/settings/billing/usage";
    routeParams = { org: input.organization, ...params };
  }

  const response = await octokit.request(route, routeParams);
  const body = response.data as UsageResponse;
  const allItems: UsageItem[] = body?.usageItems ?? [];
  debug(`Fetched ${allItems.length} total usage items`);

  const items = allItems.filter(isAiuItem);
  if (items.length === 0) {
    warning("No AI Credits (AIU) usage items found in the matched billing window.");
  } else {
    info(`Matched ${items.length} AIU line items (${items[0].date} → ${items[items.length - 1].date})`);
  }

  const totalCredits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const estimatedCostUsd = totalCredits * input.pricePerCredit;

  if (input.jobSummary && items.length > 0) {
    const scope = input.costCenter
      ? `${input.enterprise} / cost-center ${input.costCenter}`
      : input.enterprise || input.organization;
    await writeJobSummary({
      items,
      totalCredits,
      estimatedCostUsd,
      pricePerCredit: input.pricePerCredit,
      scope,
      year: input.year,
      month: input.month,
    });
  }

  if ((input.json || input.csv) && items.length > 0) {
    const artifact = new DefaultArtifactClient();
    const files: string[] = [];
    if (input.json) {
      const f = `${input.artifactName}.json`;
      writeFileSync(f, JSON.stringify(items, null, 2));
      files.push(f);
    }
    if (input.csv) {
      const f = `${input.artifactName}.csv`;
      writeFileSync(f, await json2csv(items));
      files.push(f);
    }
    if (files.length > 0) {
      await artifact.uploadArtifact(input.artifactName, files, ".");
    }
  }

  setOutput("result", JSON.stringify(items));
  setOutput("total-credits", totalCredits);
  setOutput("estimated-cost-usd", estimatedCostUsd.toFixed(2));
  setOutput("items", items.length);
  if (items.length > 0) {
    setOutput("since", items[0].date);
    setOutput("until", items[items.length - 1].date);
  }
};

export default run;
