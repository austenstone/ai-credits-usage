"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const artifact_1 = require("@actions/artifact");
const fs_1 = require("fs");
const json_2_csv_1 = require("json-2-csv");
const job_summary_1 = require("./job-summary");
const getInputs = () => {
    const token = (0, core_1.getInput)("github-token", { required: true }).trim();
    const enterprise = (0, core_1.getInput)("enterprise").trim();
    const organization = (0, core_1.getInput)("organization").trim();
    const costCenter = (0, core_1.getInput)("cost-center").trim();
    if (!enterprise && !organization && !costCenter) {
        throw new Error("One of `enterprise`, `organization`, or `cost-center` is required.");
    }
    if (costCenter && !enterprise) {
        throw new Error("`cost-center` requires `enterprise` to also be set.");
    }
    const num = (key) => {
        const raw = (0, core_1.getInput)(key);
        if (!raw)
            return undefined;
        const n = parseInt(raw, 10);
        if (Number.isNaN(n))
            throw new Error(`Input \`${key}\` must be a number, got: ${raw}`);
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
        jobSummary: (0, core_1.getBooleanInput)("job-summary"),
        json: (0, core_1.getBooleanInput)("json"),
        csv: (0, core_1.getBooleanInput)("csv"),
        artifactName: (0, core_1.getInput)("artifact-name") || "ai-credits-usage",
        pricePerCredit: parseFloat((0, core_1.getInput)("price-per-credit") || "0.04"),
    };
};
const isAiuItem = (item) => {
    const product = (item.product || "").toLowerCase();
    const sku = (item.sku || "").toLowerCase();
    const unit = (item.unitType || "").toLowerCase();
    // AIUs (a.k.a. GitHub AI Credits, fka PRUs) ride on the copilot product
    // and surface in SKU/unitType as some form of "credit", "aiu", "premium", or "token".
    const aiuSignal = /(credit|aiu|premium|token)/i;
    return product.includes("copilot") && (aiuSignal.test(sku) || aiuSignal.test(unit));
};
const run = async () => {
    const input = getInputs();
    const octokit = (0, github_1.getOctokit)(input.token);
    const params = { year: input.year };
    if (input.month !== undefined)
        params.month = input.month;
    if (input.day !== undefined)
        params.day = input.day;
    if (input.hour !== undefined)
        params.hour = input.hour;
    let route;
    let routeParams;
    if (input.costCenter) {
        (0, core_1.info)(`Fetching billing usage for cost center ${input.costCenter} in enterprise ${input.enterprise}`);
        route = "GET /enterprises/{enterprise}/settings/billing/usage/{cost_center_id}";
        routeParams = { enterprise: input.enterprise, cost_center_id: input.costCenter, ...params };
    }
    else if (input.enterprise) {
        (0, core_1.info)(`Fetching billing usage for enterprise ${input.enterprise}`);
        route = "GET /enterprises/{enterprise}/settings/billing/usage";
        routeParams = { enterprise: input.enterprise, ...params };
    }
    else {
        (0, core_1.info)(`Fetching billing usage for organization ${input.organization}`);
        route = "GET /organizations/{org}/settings/billing/usage";
        routeParams = { org: input.organization, ...params };
    }
    const response = await octokit.request(route, routeParams);
    const body = response.data;
    const allItems = body?.usageItems ?? [];
    (0, core_1.debug)(`Fetched ${allItems.length} total usage items`);
    const items = allItems.filter(isAiuItem);
    if (items.length === 0) {
        (0, core_1.warning)("No AI Credits (AIU) usage items found in the matched billing window.");
    }
    else {
        (0, core_1.info)(`Matched ${items.length} AIU line items (${items[0].date} → ${items[items.length - 1].date})`);
    }
    const totalCredits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const estimatedCostUsd = totalCredits * input.pricePerCredit;
    if (input.jobSummary && items.length > 0) {
        const scope = input.costCenter
            ? `${input.enterprise} / cost-center ${input.costCenter}`
            : input.enterprise || input.organization;
        await (0, job_summary_1.writeJobSummary)({
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
        const artifact = new artifact_1.DefaultArtifactClient();
        const files = [];
        if (input.json) {
            const f = `${input.artifactName}.json`;
            (0, fs_1.writeFileSync)(f, JSON.stringify(items, null, 2));
            files.push(f);
        }
        if (input.csv) {
            const f = `${input.artifactName}.csv`;
            (0, fs_1.writeFileSync)(f, await (0, json_2_csv_1.json2csv)(items));
            files.push(f);
        }
        if (files.length > 0) {
            await artifact.uploadArtifact(input.artifactName, files, ".");
        }
    }
    (0, core_1.setOutput)("result", JSON.stringify(items));
    (0, core_1.setOutput)("total-credits", totalCredits);
    (0, core_1.setOutput)("estimated-cost-usd", estimatedCostUsd.toFixed(2));
    (0, core_1.setOutput)("items", items.length);
    if (items.length > 0) {
        (0, core_1.setOutput)("since", items[0].date);
        (0, core_1.setOutput)("until", items[items.length - 1].date);
    }
};
exports.default = run;
//# sourceMappingURL=run.js.map