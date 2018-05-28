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
    Configuration,
    logger,
} from "@atomist/automation-client";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import {
    allSatisfied,
    branchFromCommit,
    ExecuteGoalResult,
    hasFile,
    nodeBuilder,
    ProductionEnvironment,
    ProjectVersioner,
    readSdmVersion,
    RunWithLogContext,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineOptions,
    StagingEnvironment,
} from "@atomist/sdm";
import * as build from "@atomist/sdm/blueprint/dsl/buildDsl";
import { RepoContext } from "@atomist/sdm/common/context/SdmContext";
import { MavenProjectIdentifier } from "@atomist/sdm/common/delivery/build/local/maven/pomParser";
import { executeVersioner } from "@atomist/sdm/common/delivery/build/local/projectVersioner";
import {
    DefaultDockerImageNameCreator,
    DockerOptions,
    executeDockerBuild,
} from "@atomist/sdm/common/delivery/docker/executeDockerBuild";
import {
    DockerBuildGoal,
    VersionGoal,
} from "@atomist/sdm/common/delivery/goals/common/commonGoals";
import { IsMaven } from "@atomist/sdm/common/listener/support/pushtest/jvm/jvmPushTests";
import { createKubernetesData } from "@atomist/sdm/handlers/events/delivery/goals/k8s/launchGoalK8";
import { SdmGoal } from "@atomist/sdm/ingesters/sdmGoalIngester";
import { spawnAndWatch } from "@atomist/sdm/util/misc/spawned";
import * as df from "dateformat";
import {
    ProductionDeploymentGoal,
    ReleaseDockerGoal,
    ReleaseTagGoal,
    ReleaseVersionGoal,
    StagingDeploymentGoal,
} from "./goals";
import {
    DockerReleasePreparations,
    executeReleaseDocker,
    executeReleaseTag,
    executeReleaseVersion,
} from "./release";

const MavenProjectVersioner: ProjectVersioner = async (status, p, log) => {
    const projectId = await MavenProjectIdentifier(p);
    const branch = branchFromCommit(status.commit).split("/").join(".");
    const branchSuffix = (branch !== status.commit.repo.defaultBranch) ? `${branch}.` : "";
    const version = `${projectId.version}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;
    return version;
};

async function mvnVersionPreparation(p: GitProject, rwlc: RunWithLogContext): Promise<ExecuteGoalResult> {
    const commit = rwlc.status.commit;
    const version = await readSdmVersion(
        commit.repo.owner,
        commit.repo.name,
        commit.repo.org.provider.providerId,
        commit.sha,
        branchFromCommit(commit),
        rwlc.context);
    return spawnAndWatch({
        command: "mvn",
        args: ["versions:set", `-DnewVersion="${version}"`, "versions:commit"],
    },
        {
            cwd: p.baseDir,
        },
        rwlc.progressLog);
}

const MavenPreparations = [mvnVersionPreparation];

export function addSpringSupport(sdm: SoftwareDeliveryMachine, configuration: Configuration) {

    sdm.addBuildRules(
        build.when(IsMaven)
            .itMeans("mvn test") // mvn package -Ddockerfile.skip=true
            .set(nodeBuilder(sdm.opts.projectLoader, "mvn test")));

    sdm.addGoalImplementation("mvnVersioner", VersionGoal,
        executeVersioner(sdm.opts.projectLoader, MavenProjectVersioner), { pushTest: IsMaven })
        .addGoalImplementation("mvnDockerBuild", DockerBuildGoal,
            executeDockerBuild(
                sdm.opts.projectLoader,
                DefaultDockerImageNameCreator,
                MavenPreparations,
                {
                    ...configuration.sdm.docker.hub as DockerOptions,
                    dockerfileFinder: async () => "Dockerfile",
                }), { pushTest: IsMaven })
        .addGoalImplementation("mvnDockerRelease", ReleaseDockerGoal,
            executeReleaseDocker(sdm.opts.projectLoader,
                DockerReleasePreparations,
                {
                    ...configuration.sdm.docker.hub as DockerOptions,
                }), { pushTest: allSatisfied(IsMaven, hasFile("Dockerfile")) })
        .addGoalImplementation("tagRelease", ReleaseTagGoal, executeReleaseTag(sdm.opts.projectLoader))
        .addGoalImplementation("mvnVersionRelease", ReleaseVersionGoal,
            executeReleaseVersion(sdm.opts.projectLoader, MavenProjectIdentifier), { pushTest: IsMaven });

    sdm.goalFulfillmentMapper
        .addSideEffect({
            goal: StagingDeploymentGoal,
            pushTest: IsMaven,
            sideEffectName: "@atomist/k8-automation",
        })
        .addSideEffect({
            goal: ProductionDeploymentGoal,
            pushTest: IsMaven,
            sideEffectName: "@atomist/k8-automation",
        })

        .addFullfillmentCallback({
            goal: StagingDeploymentGoal,
            callback: kubernetesDataCallback(sdm.opts, configuration),
        })
        .addFullfillmentCallback({
            goal: ProductionDeploymentGoal,
            callback: kubernetesDataCallback(sdm.opts, configuration),
        });

}

function kubernetesDataCallback(
    options: SoftwareDeliveryMachineOptions,
    configuration: Configuration,
): (goal: SdmGoal, context: RepoContext) => Promise<SdmGoal> {

    return async (goal, ctx) => {
        return options.projectLoader.doWithProject({
            credentials: ctx.credentials, id: ctx.id, context: ctx.context, readOnly: true,
        }, async p => {
            return kubernetesDataFromGoal(goal, p, configuration);
        });
    };
}

function kubernetesDataFromGoal(
    goal: SdmGoal,
    p: GitProject,
    configuration: Configuration,
): Promise<SdmGoal> {

    const ns = namespaceFromGoal(goal);
    return createKubernetesData(
        goal,
        {
            name: goal.repo.name,
            environment: configuration.environment,
            port: 8080,
            ns,
            replicas: 1,
            host: "play.atomist." + (ns === "testing") ? "services" : "com",
        },
        p);
}

function namespaceFromGoal(goal: SdmGoal): string {
    const name = goal.repo.name;
    if (/-sdm$/.test(name)) {
        return "sdm";
    } else if (name === "k8-automation") {
        return "k8-automation";
    } else if (goal.environment === StagingEnvironment.replace(/\/$/, "")) {
        return "testing";
    } else if (goal.environment === ProductionEnvironment.replace(/\/$/, "")) {
        return "production";
    } else {
        logger.debug(`Unmatched goal.environment using default namespace: ${goal.environment}`);
        return "default";
    }
}
