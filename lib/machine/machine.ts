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
    AutofixGoal,
    BuildGoal,
    GitHubRepoRef,
    goalContributors,
    Goals,
    JustBuildGoal,
    onAnyPush,
    PushReactionGoal,
    ReviewGoal,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    StagingDeploymentGoal,
    StagingEndpointGoal,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    DisableDeploy,
    DisplayDeployEnablement,
    EnableDeploy,
    ExplainDeploymentFreezeGoal,
    InMemoryDeploymentStatusManager,
    isDeploymentFrozen,
    isInLocalMode,
    ManagedDeploymentTargeter,
    StagingUndeploymentGoal,
    summarizeGoalsInGitHubStatus,
} from "@atomist/sdm-core";
import {
    configureLocalSpringBootDeploy,
    configureMavenPerBranchSpringBootDeploy,
    IsMaven,
    localExecutableJarDeployer,
    MavenBuilder,
    ReplaceReadmeTitle,
    SetAtomistTeamInApplicationYml,
    SpringProjectCreationParameters,
    SpringSupport,
    TransformSeedToCustomProject,
} from "@atomist/sdm-pack-spring";
import * as build from "@atomist/sdm/api-helper/dsl/buildDsl";
import * as deploy from "@atomist/sdm/api-helper/dsl/deployDsl";
import { executeBuild } from "@atomist/sdm/api-helper/goal/executeBuild";
import { executeDeploy } from "@atomist/sdm/api-helper/goal/executeDeploy";
import { executeUndeploy } from "@atomist/sdm/api-helper/goal/executeUndeploy";

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

    sdm.addGoalContributions(goalContributors(
        onAnyPush().setGoals(new Goals("Checks", ReviewGoal, PushReactionGoal, AutofixGoal)),
        whenPushSatisfies(IsDeploymentFrozen)
            .setGoals(ExplainDeploymentFreezeGoal),
        whenPushSatisfies(anySatisfied(IsMaven))
            .setGoals(BuildGoal),
    ));

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
        });

    sdm.addExtensionPacks(
        SpringSupport,
    );

    const mavenBuilder = new MavenBuilder(sdm);
    sdm.addGoalImplementation("Maven build",
        BuildGoal,
        executeBuild(sdm.configuration.sdm.projectLoader, mavenBuilder),
        {
            pushTest: IsMaven,
            logInterpreter: mavenBuilder.logInterpreter,
        });

    if (isInLocalMode()) {
        configureMavenPerBranchSpringBootDeploy(sdm);
    } else {
        configureLocalSpringBootDeploy(sdm);
        const deployToStaging = {
            deployer: localExecutableJarDeployer(),
            targeter: ManagedDeploymentTargeter,
            deployGoal: StagingDeploymentGoal,
            endpointGoal: StagingEndpointGoal,
            undeployGoal: StagingUndeploymentGoal,
        };
        sdm.addGoalImplementation("Maven deployer",
            deployToStaging.deployGoal,
            executeDeploy(
                sdm.configuration.sdm.artifactStore,
                sdm.configuration.sdm.repoRefResolver,
                deployToStaging.endpointGoal, deployToStaging),
            {
                pushTest: IsMaven,
                logInterpreter: deployToStaging.deployer.logInterpreter,
            },
        );
        sdm.addKnownSideEffect(
            deployToStaging.endpointGoal,
            deployToStaging.deployGoal.definition.displayName,
            AnyPush);
        sdm.addGoalImplementation("Maven deployer",
            deployToStaging.undeployGoal,
            executeUndeploy(deployToStaging),
            {
                pushTest: IsMaven,
                logInterpreter: deployToStaging.deployer.logInterpreter,
            },
        );
        sdm.addCommand(EnableDeploy)
            .addCommand(DisableDeploy)
            .addCommand(DisplayDeployEnablement);
    }

    summarizeGoalsInGitHubStatus(sdm);

    return sdm;
}
