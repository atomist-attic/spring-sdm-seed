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

import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import {
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as deploy from "@atomist/sdm/blueprint/dsl/deployDsl";
import { ManagedDeploymentTargeter } from "@atomist/sdm/common/delivery/deploy/local/ManagedDeployments";
import {
    LocalDeploymentGoal,
    LocalEndpointGoal,
    LocalUndeploymentGoal,
} from "@atomist/sdm/common/delivery/goals/common/commonGoals";
import { IsMaven } from "@atomist/sdm/common/listener/support/pushtest/jvm/jvmPushTests";
import { tagRepo } from "@atomist/sdm/common/listener/support/tagRepo";
import { listLocalDeploys } from "@atomist/sdm/handlers/commands/listLocalDeploys";
import { springBootTagger } from "@atomist/spring-automation/commands/tag/springTagger";
import { mavenSourceDeployer } from "./localSpringBootDeployers";
import { springBootGenerator } from "./springBootGenerator";

/**
 * Configuration common to Spring SDMs, wherever they deploy
 * @param {SoftwareDeliveryMachine} sdm
 * @param {{useCheckstyle: boolean}} options
 */
export function addSpringSupport(sdm: SoftwareDeliveryMachine) {
    sdm
        .addDeployRules(
            deploy.when(IsMaven)
                .itMeans("Maven local deploy")
                .deployTo(LocalDeploymentGoal, LocalEndpointGoal, LocalUndeploymentGoal)
                .using(
                    {
                        deployer: mavenSourceDeployer(sdm.opts.projectLoader),
                        targeter: ManagedDeploymentTargeter,
                    },
            ))
        .addSupportingCommands(listLocalDeploys)
        .addGenerators(() => springBootGenerator({
            addAtomistWebhook: false,
            groupId: "atomist",
            seed: new GitHubRepoRef("spring-team", "spring-rest-seed"),
            intent: "create spring",
        }))
        .addNewRepoWithCodeActions(
            tagRepo(springBootTagger),
    );
}
