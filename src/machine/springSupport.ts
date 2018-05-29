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
} from "@atomist/automation-client";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import {
    allSatisfied,
    branchFromCommit,
    createEphemeralProgressLog,
    DelimitedWriteProgressLogDecorator,
    ExecuteGoalResult,
    ExecuteGoalWithLog,
    hasFile,
    LocalDeploymentGoal,
    LocalEndpointGoal,
    LocalUndeploymentGoal,
    ManagedDeploymentTargeter,
    MavenBuilder,
    ProjectVersioner,
    readSdmVersion,
    RunWithLogContext,
    SoftwareDeliveryMachine,
    tagRepo,
} from "@atomist/sdm";
import * as build from "@atomist/sdm/blueprint/dsl/buildDsl";
import * as deploy from "@atomist/sdm/blueprint/dsl/deployDsl";
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
import { listLocalDeploys } from "@atomist/sdm/handlers/commands/listLocalDeploys";
import { spawnAndWatch } from "@atomist/sdm/util/misc/spawned";
import { springBootTagger } from "@atomist/spring-automation/commands/tag/springTagger";
import * as df from "dateformat";
import { SuggestAddingDockerfile } from "../commands/addDockerfile";
import { springBootGenerator } from "../commands/springBootGenerator";
import { mavenSourceDeployer } from "../support/localSpringBootDeployers";
import {
    PublishGoal,
    ReleaseArtifactGoal,
    ReleaseDockerGoal,
    ReleaseTagGoal,
    ReleaseVersionGoal,
} from "./goals";
import {
    DockerReleasePreparations,
    executeReleaseDocker,
    executeReleaseTag,
    executeReleaseVersion,
} from "./release";

const MavenProjectVersioner: ProjectVersioner = async (status, p, log) => {
    const projectId = await MavenProjectIdentifier(p);
    const baseVersion = projectId.version.replace(/-.*/, "");
    const branch = branchFromCommit(status.commit).split("/").join(".");
    const branchSuffix = (branch !== status.commit.repo.defaultBranch) ? `${branch}.` : "";
    const version = `${baseVersion}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;
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
        command: "mvn", args: ["versions:set", `-DnewVersion=${version}`, "versions:commit"],
    }, { cwd: p.baseDir }, rwlc.progressLog);
}

async function mvnPackagePreparation(p: GitProject, rwlc: RunWithLogContext): Promise<ExecuteGoalResult> {
    return spawnAndWatch({
        command: "mvn", args: ["package", "-DskipTests=true"],
    }, { cwd: p.baseDir }, rwlc.progressLog);
}

const MavenPreparations = [mvnVersionPreparation, mvnPackagePreparation];

function noOpImplementation(action: string): ExecuteGoalWithLog {
    return async (rwlc: RunWithLogContext): Promise<ExecuteGoalResult> => {
        const log = new DelimitedWriteProgressLogDecorator(rwlc.progressLog, "\n");
        const message = `${action} requires no implementation`;
        log.write(message);
        await log.flush();
        await log.close();
        return Promise.resolve({ code: 0, message });
    };
}

export function addSpringSupport(sdm: SoftwareDeliveryMachine, configuration: Configuration) {

    sdm.addBuildRules(
        build.when(IsMaven)
            .itMeans("mvn package")
            .set(new MavenBuilder(sdm.opts.artifactStore, createEphemeralProgressLog, sdm.opts.projectLoader)));

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
        .addGoalImplementation("mvnPublish", PublishGoal, noOpImplementation("Publish"), { pushTest: IsMaven })
        .addGoalImplementation("mvnArtifactRelease", ReleaseArtifactGoal, noOpImplementation("ReleaseArtifact"),
            { pushTest: IsMaven })
        .addGoalImplementation("mvnDockerRelease", ReleaseDockerGoal,
            executeReleaseDocker(sdm.opts.projectLoader,
                DockerReleasePreparations,
                {
                    ...configuration.sdm.docker.hub as DockerOptions,
                }), { pushTest: allSatisfied(IsMaven, hasFile("Dockerfile")) })
        .addGoalImplementation("tagRelease", ReleaseTagGoal, executeReleaseTag(sdm.opts.projectLoader))
        .addGoalImplementation("mvnVersionRelease", ReleaseVersionGoal,
            executeReleaseVersion(sdm.opts.projectLoader, MavenProjectIdentifier), { pushTest: IsMaven });

    sdm.addDeployRules(
        deploy.when(IsMaven)
            .itMeans("Maven local deploy")
            .deployTo(LocalDeploymentGoal, LocalEndpointGoal, LocalUndeploymentGoal)
            .using({
                deployer: mavenSourceDeployer(sdm.opts.projectLoader),
                targeter: ManagedDeploymentTargeter,
            }),
    )
        .addSupportingCommands(listLocalDeploys)
        .addGenerators(() => springBootGenerator({
            addAtomistWebhook: false,
            groupId: "atomist",
            seed: new GitHubRepoRef("atomist-playground", "spring-rest-seed"),
            intent: "create spring",
        }))
        .addNewRepoWithCodeActions(tagRepo(springBootTagger))
        .addChannelLinkListeners(SuggestAddingDockerfile);

}
