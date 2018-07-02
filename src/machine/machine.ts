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

import {
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    disableDeploy,
    enableDeploy,
    executeTag,
    summarizeGoalsInGitHubStatus,
    TagGoal,
} from "@atomist/sdm-core";
import { addDockerfile } from "../commands/addDockerfile";
import {addK8sSupport} from "./kubeSupport";
import { addNodeSupport } from "./nodeSupport";
import { addSpringSupport } from "./springSupport";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine({
            name: "Kubernetes Demo Software Delivery Machine",
            configuration,
        });
    addNodeSupport(sdm);
    addSpringSupport(sdm);
    addK8sSupport(sdm);
    sdm.addSupportingCommands(enableDeploy, disableDeploy, () => addDockerfile(sdm));
    sdm.addGoalImplementation("tag", TagGoal,
        executeTag(sdm.configuration.sdm.projectLoader));

    summarizeGoalsInGitHubStatus(sdm);

    return sdm;
}
