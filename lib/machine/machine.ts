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
            .setGoals(JustBuildGoal),
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

    const buildRule = build.setDefault(new MavenBuilder(sdm));
    sdm.addGoalImplementation(buildRule.name,
        BuildGoal,
        executeBuild(sdm.configuration.sdm.projectLoader, buildRule.value),
        {
            pushTest: buildRule.pushTest,
            logInterpreter: buildRule.value.logInterpreter,
        });
    sdm.addGoalImplementation(buildRule.name,
        JustBuildGoal,
        executeBuild(sdm.configuration.sdm.projectLoader, buildRule.value),
        {
            pushTest: buildRule.pushTest,
            logInterpreter: buildRule.value.logInterpreter,
        });

    if (isInLocalMode()) {
        configureMavenPerBranchSpringBootDeploy(sdm);
    } else {
        configureLocalSpringBootDeploy(sdm);
        const deployRule = deploy.when(IsMaven)
            .deployTo(StagingDeploymentGoal, StagingEndpointGoal, StagingUndeploymentGoal)
            .using(
                {
                    deployer: localExecutableJarDeployer(),
                    targeter: ManagedDeploymentTargeter,
                },
            );
        sdm.addGoalImplementation(deployRule.name, deployRule.value.deployGoal, executeDeploy(
            sdm.configuration.sdm.artifactStore,
            sdm.configuration.sdm.repoRefResolver,
            deployRule.value.endpointGoal, deployRule.value),
            {
                pushTest: deployRule.pushTest,
                logInterpreter: deployRule.value.deployer.logInterpreter,
            },
        );
        sdm.addKnownSideEffect(
            deployRule.value.endpointGoal,
            deployRule.value.deployGoal.definition.displayName,
            AnyPush);
        sdm.addGoalImplementation(deployRule.name, deployRule.value.undeployGoal, executeUndeploy(deployRule.value),
            {
                pushTest: deployRule.pushTest,
                logInterpreter: deployRule.value.deployer.logInterpreter,
            },
        );
        sdm.addCommand(EnableDeploy)
            .addCommand(DisableDeploy)
            .addCommand(DisplayDeployEnablement);
    }

    summarizeGoalsInGitHubStatus(sdm);

    return sdm;
}
