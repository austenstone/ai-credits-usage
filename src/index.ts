import { RequestError } from "@octokit/request-error";
import { setFailed } from "@actions/core";
import run from "./run";

run().catch((err: unknown) => {
  if (err instanceof RequestError) {
    setFailed(`Request failed: (${err.status}) ${err.message}`);
  } else if (err instanceof Error) {
    setFailed(err);
  } else {
    setFailed(JSON.stringify(err, null, 2));
  }
});
