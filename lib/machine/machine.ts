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

import { SuccessIsReturn0ErrorFinder } from "@atomist/automation-client";
import {
    AutoCodeInspection,
    Autofix,
    Build,
    GitHubRepoRef,
    goalContributors,
    goals,
    onAnyPush,
    PrepareForGoalExecution,
    PushImpact,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    spawnAndWatch,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    Version,
} from "@atomist/sdm-core";
import {
    DockerBuild,
    HasDockerfile,
} from "@atomist/sdm-pack-docker";
import {
    KubernetesDeploy,
    kubernetesSupport,
} from "@atomist/sdm-pack-k8";
import {
    IsMaven,
    MavenBuilder,
    MavenProjectVersioner,
    MavenVersionPreparation,
    ReplaceReadmeTitle,
    SetAtomistTeamInApplicationYml,
    SpringProjectCreationParameterDefinitions,
    SpringProjectCreationParameters,
    SpringSupport,
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
            name: "Spring software delivery machine",
            configuration,
        });

    const autofix = new Autofix().with(AddDockerfileAutofix);

    const version = new Version().with({
        name: "mvn-versioner",
        versioner: MavenProjectVersioner,
    });

    const build = new Build().with({
        name: "mvn",
        builder: new MavenBuilder(sdm),
    });

    const dockerBuild = new DockerBuild().with({
        name: "mvn-docker",
        preparations: [MavenVersionPreparation, MavenPackage],
        options: { push: false },
    });

    const kubernetesDeploy = new KubernetesDeploy({ environment: "testing" });

    const BaseGoals = goals("checks")
        .plan(version, autofix, new AutoCodeInspection(), new PushImpact());

    const BuildGoals = goals("build")
        .plan(build).after(autofix, version);

    const DeployGoals = goals("deploy")
        .plan(dockerBuild).after(build)
        .plan(kubernetesDeploy).after(dockerBuild);

    sdm.addGoalContributions(goalContributors(
        onAnyPush().setGoals(BaseGoals),
        whenPushSatisfies(IsMaven).setGoals(BuildGoals),
        whenPushSatisfies(HasDockerfile).setGoals(DeployGoals),
    ));

    sdm.addExtensionPacks(
        SpringSupport,
        kubernetesSupport({ context: "minikube" }),
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

const MavenPackage: PrepareForGoalExecution = async (p, r) => {
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
