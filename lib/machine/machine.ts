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
    AnyPush,
    anySatisfied,
    AutofixGoal, GitHubRepoRef,
    goalContributors,
    Goals, JustBuildGoal, onAnyPush, PushReactionGoal, ReviewGoal,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration, StagingDeploymentGoal, StagingEndpointGoal, whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine, DisableDeploy, DisplayDeployEnablement, EnableDeploy,
    ExplainDeploymentFreezeGoal,
    InMemoryDeploymentStatusManager,
    isDeploymentFrozen,
    isInLocalMode, ManagedDeploymentTargeter, RepositoryDeletionGoals, StagingUndeploymentGoal,
} from "@atomist/sdm-core";
import {
    configureLocalSpringBootDeploy, configureMavenPerBranchSpringBootDeploy,
    IsMaven, localExecutableJarDeployer, MavenBuilder,
    ReplaceReadmeTitle,
    SetAtomistTeamInApplicationYml,
    SpringProjectCreationParameters, SpringSupport, TransformSeedToCustomProject,
} from "@atomist/sdm-pack-spring";
import * as build from "@atomist/sdm/api-helper/dsl/buildDsl";
import * as deploy from "@atomist/sdm/api-helper/dsl/deployDsl";

const freezeStore = new InMemoryDeploymentStatusManager();

const IsDeploymentFrozen = isDeploymentFrozen(freezeStore);

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm: SoftwareDeliveryMachine = createSoftwareDeliveryMachine(
        {
            name: "Spring software delivery machine",
            configuration,
        });

    configureGoals(sdm);
    configureGenerators(sdm);
    configureExtensionPacks(sdm);
    configureBuilder(sdm);

    if (isInLocalMode()) {
        configureDeploysForLocalSdm(sdm);
    } else {
        configureDeploysForCloudSdm(sdm);
    }

    return sdm;
}

export function configureDeploysForCloudSdm(sdm: SoftwareDeliveryMachine) {
    configureLocalSpringBootDeploy(sdm);
    sdm.addDeployRules(
        deploy.when(IsMaven)
            .deployTo(StagingDeploymentGoal, StagingEndpointGoal, StagingUndeploymentGoal)
            .using(
                {
                    deployer: localExecutableJarDeployer(),
                    targeter: ManagedDeploymentTargeter,
                },
            ),
    );

    sdm.addDisposalRules(
        whenPushSatisfies(AnyPush)
            .itMeans("We can always delete the repo")
            .setGoals(RepositoryDeletionGoals));

    sdm.addCommand(EnableDeploy)
        .addCommand(DisableDeploy)
        .addCommand(DisplayDeployEnablement);
}

function configureGoals(sdm: SoftwareDeliveryMachine) {
    // Each contributor contributes goals. The infrastructure assembles them into a goal set.
    sdm.addGoalContributions(goalContributors(
        onAnyPush().setGoals(new Goals("Checks", ReviewGoal, PushReactionGoal, AutofixGoal)),
        whenPushSatisfies(IsDeploymentFrozen)
            .setGoals(ExplainDeploymentFreezeGoal),
        whenPushSatisfies(anySatisfied(IsMaven))
            .setGoals(JustBuildGoal),
    ));
}

function configureGenerators(sdm: SoftwareDeliveryMachine) {
    sdm
        .addGeneratorCommand<SpringProjectCreationParameters>({
            name: "create-spring",
            intent: "create spring",
            description: "Create a new Java Spring Boot REST service",
            paramsMaker: SpringProjectCreationParameters,
            startingPoint: new GitHubRepoRef("spring-team", "spring-rest-seed"),
            transform: [
                ReplaceReadmeTitle,
                SetAtomistTeamInApplicationYml,
                TransformSeedToCustomProject,
            ],
        })
        .addGeneratorCommand<SpringProjectCreationParameters>({
            name: "create-spring-kotlin",
            intent: "create spring kotlin",
            description: "Create a new Kotlin Spring Boot REST service",
            paramsMaker: SpringProjectCreationParameters,
            startingPoint: new GitHubRepoRef("johnsonr", "flux-flix-service"),
            transform: [
                ReplaceReadmeTitle,
                SetAtomistTeamInApplicationYml,
                TransformSeedToCustomProject,
            ],
        });
}

function configureExtensionPacks(sdm: SoftwareDeliveryMachine) {
    sdm.addExtensionPacks(
        SpringSupport,
    );
}

export function configureBuilder(sdm: SoftwareDeliveryMachine) {
    const mb = new MavenBuilder(sdm);
    sdm.addBuildRules(
        build.setDefault(mb));
    return sdm;
}

function configureDeploysForLocalSdm(sdm: SoftwareDeliveryMachine) {
    configureMavenPerBranchSpringBootDeploy(sdm);
}
