/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { SuccessIsReturn0ErrorFinder } from "@atomist/automation-client/util/spawned";
import { PrepareForGoalExecution } from "@atomist/sdm";
import { spawnAndWatch } from "@atomist/sdm/api-helper/misc/spawned";

export const MavenPackage: PrepareForGoalExecution = async (p, r) => {
    const result = await spawnAndWatch({
            command: "mvn",
            args: ["package", "-DskipTests=true", `-Dartifact.name=${r.id.repo}`],
        }, {
            cwd: p.baseDir,
        },
        r.progressLog,
        {
            errorFinder: SuccessIsReturn0ErrorFinder,
        });
    return result;
};
