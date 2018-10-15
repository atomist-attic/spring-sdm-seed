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

import { GitHubRepoRef } from "@atomist/automation-client";
import {
    AutoCodeInspection,
    Autofix,
    goalContributors,
    goals,
    onAnyPush,
    PushImpact,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    isInLocalMode,
    Version,
} from "@atomist/sdm-core";
import { Build } from "@atomist/sdm-pack-build";
import {
    DockerBuild,
    HasDockerfile,
} from "@atomist/sdm-pack-docker";
import { singleIssuePerCategoryManaging } from "@atomist/sdm-pack-issue";
import {
    KubernetesDeploy,
    kubernetesSupport,
} from "@atomist/sdm-pack-k8";
import {
    IsMaven,
    mavenBuilder,
    MavenDefaultOptions,
    MavenProjectVersioner,
    MvnPackage,
    MvnVersion,
    ReplaceReadmeTitle,
    SetAtomistTeamInApplicationYml,
    SpringProjectCreationParameterDefinitions,
    SpringProjectCreationParameters,
    springSupport,
    TransformSeedToCustomProject,
} from "@atomist/sdm-pack-spring";
import {
    AddDockerfileAutofix,
    AddDockerfileTransform,
} from "../transform/addDockerfile";
import { AddFinalNameToPom } from "../transform/addFinalName";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm: SoftwareDeliveryMachine = createSoftwareDeliveryMachine(
        {
            name: "Spring Software Delivery Machine",
            configuration,
        });

    const autofix = new Autofix().with(AddDockerfileAutofix);
    const version = new Version().withVersioner(MavenProjectVersioner);
    const codeInspection = new AutoCodeInspection();

    const build = new Build().with({
            ...MavenDefaultOptions,
            builder: mavenBuilder(),
        });

    const dockerBuild = new DockerBuild().with({
            ...MavenDefaultOptions,
            options: { push: false },
        })
        .withProjectListener(MvnVersion)
        .withProjectListener(MvnPackage);

    const kubernetesDeploy = new KubernetesDeploy({ environment: "testing" });

    const BaseGoals = goals("checks")
        .plan(version, autofix, codeInspection, new PushImpact());

    const BuildGoals = goals("build")
        .plan(build).after(BaseGoals);

    const DeployGoals = goals("deploy")
        .plan(dockerBuild).after(BuildGoals)
        .plan(kubernetesDeploy).after(dockerBuild);

    sdm.addGoalContributions(goalContributors(
        onAnyPush().setGoals(BaseGoals),
        whenPushSatisfies(IsMaven).setGoals(BuildGoals),
        whenPushSatisfies(HasDockerfile).setGoals(DeployGoals),
    ));

    sdm.addExtensionPacks(
        springSupport({
            inspectGoal: codeInspection,
            autofixGoal: autofix,
            review: {
                cloudNative: true,
                springStyle: true,
            },
            autofix: {
                springStyle: true,
                cloudNative: true,
            },
            reviewListeners: isInLocalMode() ? [] : [
                singleIssuePerCategoryManaging("sdm-pack-spring"),
            ],
        }),
        kubernetesSupport(),
    );

    sdm.addGeneratorCommand<SpringProjectCreationParameters>({
        name: "create-spring",
        intent: "create spring",
        description: "Create a new Java Spring Boot REST service",
        parameters: SpringProjectCreationParameterDefinitions,
        startingPoint: GitHubRepoRef.from({ owner: "atomist-seeds", repo: "spring-rest-seed", branch: "master" }),
        transform: [
            ReplaceReadmeTitle,
            SetAtomistTeamInApplicationYml,
            TransformSeedToCustomProject,
            AddDockerfileTransform,
            AddFinalNameToPom,
        ],
    });

    return sdm;
}
