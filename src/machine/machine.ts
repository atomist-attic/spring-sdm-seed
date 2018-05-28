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
    executeTag,
    FromAtomist,
    IsAtomistAutomationClient,
    not,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineOptions,
    TagGoal,
    ToDefaultBranch,
    ToPublicRepo,
    whenPushSatisfies,
} from "@atomist/sdm";
import { NoGoals } from "@atomist/sdm/common/delivery/goals/common/commonGoals";
import { IsDeployEnabled } from "@atomist/sdm/common/listener/support/pushtest/deployPushTests";
import { HasDockerfile } from "@atomist/sdm/common/listener/support/pushtest/docker/dockerPushTests";
import { IsMaven } from "@atomist/sdm/common/listener/support/pushtest/jvm/jvmPushTests";
import { IsNode } from "@atomist/sdm/common/listener/support/pushtest/node/nodePushTests";
import {
    disableDeploy,
    enableDeploy,
} from "@atomist/sdm/handlers/commands/SetDeployEnablement";
import { addDockerfile } from "../commands/addDockerfile";
import {
    IsSimplifiedDeployment,
} from "../support/isSimplifiedDeployment";
import { MaterialChangeToJavaRepo } from "../support/materialChangeToJavaRepo";
import { MaterialChangeToNodeRepo } from "../support/materialChangeToNodeRepo";
import { HasSpringBootApplicationClass } from "../support/springPushTests";
import {
    BuildGoals,
    BuildReleaseGoals,
    DockerGoals,
    DockerReleaseGoals,
    KubernetesDeployGoals,
    LocalDeploymentGoals,
    SimplifiedKubernetesDeployGoals,
} from "./goals";
import { addNodeSupport } from "./nodeSupport";
import { addSpringSupport } from "./springSupport";

export function machine(
    options: SoftwareDeliveryMachineOptions,
    configuration: Configuration,
): SoftwareDeliveryMachine {

    const sdm = new SoftwareDeliveryMachine(
        "Atomist Software Delivery Machine",
        options,

        // Node
        whenPushSatisfies(IsNode, not(MaterialChangeToNodeRepo))
            .itMeans("No Material Change")
            .setGoals(NoGoals),
        // Simplified deployment goalset for demo-sdm that skips testing deploy
        whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsDeployEnabled, IsAtomistAutomationClient,
            IsSimplifiedDeployment("demo-sdm"))
            .itMeans("Simplified Deploy")
            .setGoals(SimplifiedKubernetesDeployGoals),
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

        // Spring
        whenPushSatisfies(IsMaven, not(MaterialChangeToJavaRepo))
            .itMeans("No material change to Java")
            .setGoals(NoGoals),
        whenPushSatisfies(IsMaven, HasSpringBootApplicationClass, ToDefaultBranch, HasDockerfile, ToPublicRepo,
            not(FromAtomist), IsDeployEnabled)
            .itMeans("Spring Boot service to deploy")
            .setGoals(KubernetesDeployGoals),
        whenPushSatisfies(IsMaven, HasSpringBootApplicationClass, HasDockerfile, ToPublicRepo, not(FromAtomist))
            .itMeans("Spring Boot service to Dockerize")
            .setGoals(DockerGoals),
        whenPushSatisfies(IsMaven, HasSpringBootApplicationClass, not(FromAtomist))
            .itMeans("Spring Boot service local deploy")
            .setGoals(LocalDeploymentGoals),

    );

    sdm.addSupportingCommands(enableDeploy, disableDeploy, () => addDockerfile);

    sdm.addGoalImplementation("tag", TagGoal,
        executeTag(sdm.opts.projectLoader));

    addNodeSupport(sdm, configuration);
    addSpringSupport(sdm, configuration);

    return sdm;
}
