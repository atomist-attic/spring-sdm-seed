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

import { Configuration } from "@atomist/automation-client";
import {
    DoNotSetAnyGoals,
    executeTag,
    IsAtomistAutomationClient,
    IsLein,
    not,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineOptions,
    TagGoal,
    ToDefaultBranch,
    whenPushSatisfies,
} from "@atomist/sdm";
import { NoGoals } from "@atomist/sdm/common/delivery/goals/common/commonGoals";
import { HasTravisFile } from "@atomist/sdm/common/listener/support/pushtest/ci/ciPushTests";
import { IsDeployEnabled } from "@atomist/sdm/common/listener/support/pushtest/deployPushTests";
import { HasDockerfile } from "@atomist/sdm/common/listener/support/pushtest/docker/dockerPushTests";
import { IsNode } from "@atomist/sdm/common/listener/support/pushtest/node/nodePushTests";
import {
    disableDeploy,
    enableDeploy,
} from "@atomist/sdm/handlers/commands/SetDeployEnablement";
import {
    IsSimplifiedDeployment,
    IsTeam,
} from "../support/isSimplifiedDeployment";
import { MaterialChangeToClojureRepo } from "../support/materialChangeToClojureRepo";
import { MaterialChangeToNodeRepo } from "../support/materialChangeToNodeRepo";
import {
    BuildGoals,
    BuildReleaseGoals,
    CheckGoals,
    DockerGoals,
    DockerReleaseGoals,
    KubernetesDeployGoals,
    LeinDockerGoals,
    SimplifiedKubernetesDeployGoals,
    StagingKubernetesDeployGoals,
} from "./goals";
import { addLeinSupport } from "./leinSupport";
import { addNodeSupport } from "./nodeSupport";

export function machine(options: SoftwareDeliveryMachineOptions,
                        configuration: Configuration): SoftwareDeliveryMachine {
    const sdm = new SoftwareDeliveryMachine(
        "Atomist Software Delivery Machine",
        options,

        whenPushSatisfies(not(IsLein), IsTeam("T095SFFBK"))
            .itMeans("Non Clojure repository in Atomist team")
            .setGoals(DoNotSetAnyGoals),

        whenPushSatisfies(not(IsNode), IsTeam("T29E48P34"))
            .itMeans("Non Node repository in Community team")
            .setGoals(DoNotSetAnyGoals),

        // Node

        whenPushSatisfies(IsNode, not(MaterialChangeToNodeRepo))
            .itMeans("No Material Change")
            .setGoals(NoGoals),

        whenPushSatisfies(IsNode, HasTravisFile)
            .itMeans("Just Checking")
            .setGoals(CheckGoals),

        // Simplified deployment goalset for automation-client-sdm and k8-automation; we are skipping
        // testing for these and deploying straight into their respective namespaces
        whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsDeployEnabled, IsAtomistAutomationClient,
            IsSimplifiedDeployment("k8-automation", "atomist-sdm"))
            .itMeans("Simplified Deploy")
            .setGoals(SimplifiedKubernetesDeployGoals),

        whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsAtomistAutomationClient,
            IsSimplifiedDeployment("sample-sdm"))
            .itMeans("Staging Deploy")
            .setGoals(StagingKubernetesDeployGoals),

        whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsDeployEnabled, IsAtomistAutomationClient)
            .itMeans("Deploy")
            .setGoals(KubernetesDeployGoals),

        whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsDeployEnabled, IsAtomistAutomationClient)
            .itMeans("Deploy")
            .setGoals(KubernetesDeployGoals),

        whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsAtomistAutomationClient)
            .itMeans("Docker Release Build")
            .setGoals(DockerReleaseGoals),

        whenPushSatisfies(IsNode, HasDockerfile, IsAtomistAutomationClient)
            .itMeans("Docker Build")
            .setGoals(DockerGoals),

        whenPushSatisfies(IsNode, not(HasDockerfile), ToDefaultBranch)
            .itMeans("Release Build")
            .setGoals(BuildReleaseGoals),

        whenPushSatisfies(IsNode, not(HasDockerfile))
            .itMeans("Build")
            .setGoals(BuildGoals),

        // Clojure

        whenPushSatisfies(IsLein, not(HasTravisFile), not(MaterialChangeToClojureRepo))
            .itMeans("No material change")
            .setGoals(NoGoals),

        whenPushSatisfies(IsLein, not(HasTravisFile), ToDefaultBranch, MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Service with Leinigen")
            .setGoals(LeinDockerGoals),

    );

    sdm.addSupportingCommands(enableDeploy, disableDeploy);

    sdm.addGoalImplementation("tag", TagGoal,
        executeTag(sdm.opts.projectLoader));

    addNodeSupport(sdm, configuration);
    addLeinSupport(sdm, configuration);

    return sdm;
}
