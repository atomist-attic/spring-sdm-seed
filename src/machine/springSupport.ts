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

import {GitHubRepoRef} from "@atomist/automation-client/operations/common/GitHubRepoRef";
import {GitProject} from "@atomist/automation-client/project/git/GitProject";
import {
    allSatisfied,
    Builder,
    BuildGoal,
    ExecuteGoalResult,
    ExecuteGoalWithLog,
    FromAtomist,
    Goal,
    goalContributors,
    hasFile,
    JustBuildGoal,
    not,
    RunWithLogContext,
    SoftwareDeliveryMachine,
    ToDefaultBranch,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    DefaultDockerImageNameCreator,
    DockerBuildGoal,
    DockerOptions,
    executeDockerBuild,
    executeVersioner,
    HasDockerfile,
    NoGoals,
    tagRepo,
    ToPublicRepo,
    VersionGoal,
} from "@atomist/sdm-core";
import {
    ProjectVersioner,
    readSdmVersion,
} from "@atomist/sdm-core/internal/delivery/build/local/projectVersioner";
import {
    IsMaven,
    MavenProjectIdentifier,
    springBootGenerator,
    springBootTagger,
} from "@atomist/sdm-pack-spring";
import {
    CommonJavaGeneratorConfig,
    HasSpringBootApplicationClass,
    MavenBuilder,
} from "@atomist/sdm-pack-spring/dist";
import {
    branchFromCommit,
    executeBuild,
} from "@atomist/sdm/api-helper/goal/executeBuild";
import {DelimitedWriteProgressLogDecorator} from "@atomist/sdm/api-helper/log/DelimitedWriteProgressLogDecorator";
import {createEphemeralProgressLog} from "@atomist/sdm/api-helper/log/EphemeralProgressLog";
import {spawnAndWatch} from "@atomist/sdm/api-helper/misc/spawned";
import * as df from "dateformat";
import {SuggestAddingDockerfile} from "../commands/addDockerfile";
import {MaterialChangeToJvmRepo} from "../support/materialChangeToRepo";
import {
    BuildGoals,
    DockerGoals,
    KubernetesDeployGoals,
    PublishGoal,
    ReleaseArtifactGoal,
    ReleaseDockerGoal,
    ReleaseDocsGoal,
    ReleaseTagGoal,
    ReleaseVersionGoal,
} from "./goals";
import {
    DockerReleasePreparations,
    executeReleaseDocker,
    executeReleaseTag,
    executeReleaseVersion,
} from "./release";

const MavenProjectVersioner: ProjectVersioner = async (status, p) => {
    const projectId = await MavenProjectIdentifier(p);
    const baseVersion = projectId.version.replace(/-.*/, "");
    const branch = branchFromCommit(status.commit).split("/").join(".");
    const branchSuffix = (branch !== status.commit.repo.defaultBranch) ? `${branch}.` : "";
    return `${baseVersion}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;
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
    }, {cwd: p.baseDir}, rwlc.progressLog);
}

async function mvnPackagePreparation(p: GitProject, rwlc: RunWithLogContext): Promise<ExecuteGoalResult> {
    return spawnAndWatch({
        command: "mvn", args: ["package", "-DskipTests=true"],
    }, {cwd: p.baseDir}, rwlc.progressLog);
}

const MavenPreparations = [mvnVersionPreparation, mvnPackagePreparation];

function noOpImplementation(action: string): ExecuteGoalWithLog {
    return async (rwlc: RunWithLogContext): Promise<ExecuteGoalResult> => {
        const log = new DelimitedWriteProgressLogDecorator(rwlc.progressLog, "\n");
        const message = `${action} requires no implementation`;
        log.write(message);
        await log.flush();
        await log.close();
        return Promise.resolve({code: 0, message});
    };
}

function addBuilderForGoals(sdm: SoftwareDeliveryMachine, builder: Builder, goals: Goal[]) {
    goals.forEach(goal => {
        sdm.addGoalImplementation("Maven build", goal, executeBuild(sdm.configuration.sdm.projectLoader,
            builder),
            {
                pushTest: IsMaven,
                logInterpreter: builder.logInterpreter,
            });
    });
}

function enableMavenBuilder(sdm: SoftwareDeliveryMachine) {
    const mavenBuilder = new MavenBuilder(sdm.configuration.sdm.artifactStore, createEphemeralProgressLog, sdm.configuration.sdm.projectLoader);
    addBuilderForGoals(sdm, mavenBuilder, [BuildGoal, JustBuildGoal]);
}

function doNothingOnNoMaterialChange() {
    return whenPushSatisfies(IsMaven, not(MaterialChangeToJvmRepo))
        .itMeans("No material change to Java")
        .setGoals(NoGoals);
}

function deploySpringBootService() {
    return whenPushSatisfies(IsMaven, HasSpringBootApplicationClass, ToDefaultBranch, HasDockerfile, ToPublicRepo,
        not(FromAtomist))
        .itMeans("Spring Boot service to deploy")
        .setGoals(KubernetesDeployGoals);
}

function dockerizeSpringBootService() {
    return whenPushSatisfies(IsMaven, HasSpringBootApplicationClass, HasDockerfile, ToPublicRepo, not(FromAtomist))
        .itMeans("Spring Boot service to Dockerize")
        .setGoals(DockerGoals);
}

function defaultMavenBuild() {
    return whenPushSatisfies(IsMaven, not(HasDockerfile))
        .itMeans("Build")
        .setGoals(BuildGoals);
}

function versioningWithMaven(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnVersioner", VersionGoal,
        executeVersioner(sdm.configuration.sdm.projectLoader, MavenProjectVersioner), {pushTest: IsMaven});
}

function buildDockerWithMavenArtifacts(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnDockerBuild", DockerBuildGoal,
        executeDockerBuild(
            sdm.configuration.sdm.projectLoader,
            DefaultDockerImageNameCreator,
            MavenPreparations,
            {
                ...sdm.configuration.sdm.docker.hub as DockerOptions,
                dockerfileFinder: async () => "Dockerfile",
            }), {pushTest: IsMaven});
}

function publishWithMaven(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnPublish", PublishGoal,
        noOpImplementation("Publish"), {pushTest: IsMaven});
}

function releaseWithMavenIfNoDockerfilePresent(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnArtifactRelease", ReleaseArtifactGoal,
        noOpImplementation("ReleaseArtifact"),
        {pushTest: IsMaven});
}

function releaseWithDockerIfDockerfilePresent(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnDockerRelease", ReleaseDockerGoal,
        executeReleaseDocker(
            sdm.configuration.sdm.projectLoader,
            DockerReleasePreparations,
            {
                ...sdm.configuration.sdm.docker.hub as DockerOptions,
            }), {pushTest: allSatisfied(IsMaven, hasFile("Dockerfile"))});
}

function releaseTag(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("tagRelease", ReleaseTagGoal,
        executeReleaseTag(sdm.configuration.sdm.projectLoader));
}

function releaseDocumentationWithMaven(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnDocsRelease", ReleaseDocsGoal,
        noOpImplementation("ReleaseDocs"), {pushTest: IsMaven});
}

function releaseVersionWithMavenGAV(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnVersionRelease", ReleaseVersionGoal,
        executeReleaseVersion(sdm.configuration.sdm.projectLoader, MavenProjectIdentifier), {pushTest: IsMaven});
}

function addSpringGenerator(sdm: SoftwareDeliveryMachine, gitHubRepoRef) {
    sdm.addGenerator(springBootGenerator({
        ...CommonJavaGeneratorConfig,
        seed: () => gitHubRepoRef,
        groupId: "atomist",
    }, {
        intent: "create spring",
    }))
        .addNewRepoWithCodeAction(tagRepo(springBootTagger))
        .addChannelLinkListener(SuggestAddingDockerfile);
}

export function addSpringSupport(sdm: SoftwareDeliveryMachine) {
    enableMavenBuilder(sdm);

    sdm.addGoalContributions(goalContributors(
        doNothingOnNoMaterialChange(),
        deploySpringBootService(),
        dockerizeSpringBootService(),
        defaultMavenBuild()));

    versioningWithMaven(sdm);
    buildDockerWithMavenArtifacts(sdm);
    publishWithMaven(sdm);
    releaseWithMavenIfNoDockerfilePresent(sdm);
    releaseWithDockerIfDockerfilePresent(sdm);
    releaseTag(sdm);
    releaseDocumentationWithMaven(sdm);
    releaseVersionWithMavenGAV(sdm);

    const seedProject = new GitHubRepoRef(sdm.configuration.sdm.generator.spring.project.owner, sdm.configuration.sdm.generator.spring.project.repo);
    addSpringGenerator(sdm, seedProject);
}
