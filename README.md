# ai-credits-usage

GitHub Action that reports on **GitHub AI Credits (AIU)** consumption — the credits that power Copilot premium requests, formerly PRUs.

Drops a markdown **job summary** into your workflow run with totals, daily trend, top SKUs/models, top users, top repos. Optionally uploads **JSON** and **CSV** artifacts.

This is the AIU sibling of [`austenstone/copilot-usage`](https://github.com/austenstone/copilot-usage) and [`austenstone/github-actions-usage-report`](https://github.com/austenstone/github-actions-usage-report).

## Usage

```yaml
name: AI Credits Usage
on:
  schedule:
    - cron: "0 13 * * 1" # every Monday 13:00 UTC
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: austenstone/ai-credits-usage@v1
        with:
          github-token: ${{ secrets.BILLING_TOKEN }}
          enterprise: my-enterprise-slug
          # optional period filters (defaults to current year):
          # year: 2026
          # month: 5
          # day: 14
          job-summary: true
          json: true
          csv: true
```

### Org scope

```yaml
- uses: austenstone/ai-credits-usage@v1
  with:
    github-token: ${{ secrets.BILLING_TOKEN }}
    organization: my-org
    month: 5
```

### Cost-center scope (enterprise)

```yaml
- uses: austenstone/ai-credits-usage@v1
  with:
    github-token: ${{ secrets.BILLING_TOKEN }}
    enterprise: my-enterprise-slug
    cost-center: 12345
```

## Inputs

| Input | Default | Notes |
|-------|---------|-------|
| `github-token` | _(required)_ | PAT or GitHub App token with billing-usage scope (`admin:enterprise` for enterprise, `admin:org` for org). |
| `enterprise` | | Enterprise slug. One of `enterprise`, `organization`, or `cost-center` required. |
| `organization` | `${{ github.repository_owner }}` | Org slug. |
| `cost-center` | | Enterprise cost-center ID. Requires `enterprise`. |
| `year` / `month` / `day` / `hour` | current year | Period filters passed to the billing usage API. |
| `job-summary` | `true` | Render the markdown job summary. |
| `json` | `true` | Upload AIU usage as a JSON artifact. |
| `csv` | `false` | Upload AIU usage as a CSV artifact. |
| `artifact-name` | `ai-credits-usage` | Artifact name (also basename for files). |
| `price-per-credit` | `0.04` | USD price per AI Credit, used for estimated cost rollups. |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Filtered AIU usage items as a JSON string. |
| `total-credits` | Sum of AIU credits in the period. |
| `estimated-cost-usd` | `total-credits * price-per-credit`. |
| `items` | Number of matched line items. |
| `since` / `until` | First / last date in the matched data. |

## How filtering works

The action hits the [enhanced billing usage API](https://docs.github.com/en/rest/billing/enhanced-billing) and keeps only line items where:

- `product` contains `copilot`, **and**
- `sku` or `unitType` matches `/credit|aiu|premium|token/i`

If your tenant labels AIUs differently, open an issue with a sample SKU and the filter will be tuned.

## License

MIT
