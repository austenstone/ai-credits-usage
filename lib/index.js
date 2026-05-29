"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const request_error_1 = require("@octokit/request-error");
const core_1 = require("@actions/core");
const run_1 = __importDefault(require("./run"));
(0, run_1.default)().catch((err) => {
    if (err instanceof request_error_1.RequestError) {
        (0, core_1.setFailed)(`Request failed: (${err.status}) ${err.message}`);
    }
    else if (err instanceof Error) {
        (0, core_1.setFailed)(err);
    }
    else {
        (0, core_1.setFailed)(JSON.stringify(err, null, 2));
    }
});
//# sourceMappingURL=index.js.map