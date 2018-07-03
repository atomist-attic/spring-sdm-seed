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
    allSatisfied,
    Builder,
    BuildGoal,
    Goal,
    goalContributors,
    hasFile,
    IsDeployEnabled,
    JustBuildGoal,
    not,
    PushTest,
    SoftwareDeliveryMachine,
    ToDefaultBranch,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    DefaultDockerImageNameCreator,
    DockerBuildGoal,
    DockerOptions,
    executeDockerBuild,
    executePublish,
    executeVersioner,
    HasDockerfile,
    IsAtomistAutomationClient,
    IsNode,
    nodeBuilder,
    NodeProjectIdentifier,
    NodeProjectVersioner,
    NoGoals,
    NpmOptions,
    NpmPreparations,
    PackageLockFingerprinter,
    tagRepo,
    tslintFix,
    VersionGoal,
} from "@atomist/sdm-core";
import {executeBuild} from "@atomist/sdm/api-helper/goal/executeBuild";
import {IsSimplifiedDeployment} from "../support/isSimplifiedDeployment";
import {
    MaterialChangeToNodeRepo,
} from "../support/materialChangeToRepo";
import {AutomationClientTagger} from "../support/tagger";
import {
    BuildGoals,
    BuildReleaseGoals,
    DockerGoals,
    DockerReleaseGoals,
    KubernetesDeployGoals,
    ProductionDeploymentGoal,
    PublishGoal,
    ReleaseArtifactGoal,
    ReleaseDockerGoal,
    ReleaseDocsGoal,
    ReleaseVersionGoal,
    SimplifiedKubernetesDeployGoals,
    StagingDeploymentGoal,
} from "./goals";
import {
    DockerReleasePreparations,
    DocsReleasePreparations,
    executeReleaseDocker,
    executeReleaseDocs,
    executeReleaseNpm,
    executeReleaseVersion,
    NpmReleasePreparations,
} from "./release";

function doNothingOnNoMaterialChange() {
    return whenPushSatisfies(IsNode, not(MaterialChangeToNodeRepo))
        .itMeans("No material change to Java")
        .setGoals(NoGoals);
}

function simplifiedKubernetesDeploy() {
    return whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsDeployEnabled, IsAtomistAutomationClient,
        IsSimplifiedDeployment("demo-sdm", "sentry-automation"))
        .itMeans("Simplified Deploy")
        .setGoals(SimplifiedKubernetesDeployGoals);
}

function deployWithKubernetes() {
    return whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsDeployEnabled, IsAtomistAutomationClient)
        .itMeans("Deploy")
        .setGoals(KubernetesDeployGoals);
}

function releaseWithDocker() {
    return whenPushSatisfies(IsNode, HasDockerfile, ToDefaultBranch, IsAtomistAutomationClient)
        .itMeans("Docker Release Build")
        .setGoals(DockerReleaseGoals);
}

function buildWithDocker() {
    return whenPushSatisfies(IsNode, HasDockerfile, IsAtomistAutomationClient)
        .itMeans("Docker Build")
        .setGoals(DockerGoals);
}

function releaseWithNoDockerfilePresent() {
    return whenPushSatisfies(IsNode, not(HasDockerfile), ToDefaultBranch)
        .itMeans("Release Build")
        .setGoals(BuildReleaseGoals);
}

function defaultBuildNode() {
    return whenPushSatisfies(IsNode, not(HasDockerfile))
        .itMeans("Build")
        .setGoals(BuildGoals);
}

function addBuilderForGoals(sdm: SoftwareDeliveryMachine, builder: Builder, pushtests: PushTest[], goals: Goal[]) {
    goals.forEach(goal => {
        sdm.addGoalImplementation("Maven build", goal, executeBuild(sdm.configuration.sdm.projectLoader,
            builder),
            {
                pushTest: allSatisfied(...pushtests),
                logInterpreter: builder.logInterpreter,
            });
    });
}

function enableNodeBuilder(sdm: SoftwareDeliveryMachine) {
    const hasPackageLock = hasFile("package-lock.json");
    const nodeCiBuilder = nodeBuilder(sdm.configuration.sdm.projectLoader, "npm ci", "npm run build");
    addBuilderForGoals(sdm, nodeCiBuilder, [IsNode, hasPackageLock], [BuildGoal, JustBuildGoal]);
    const nodeInstallBuilder = nodeBuilder(sdm.configuration.sdm.projectLoader, "npm install", "npm run build");
    addBuilderForGoals(sdm, nodeInstallBuilder, [IsNode, not(hasPackageLock)], [BuildGoal, JustBuildGoal]);
}

function versioningUsingNode(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodeVersioner", VersionGoal,
        executeVersioner(sdm.configuration.sdm.projectLoader, NodeProjectVersioner), {pushTest: IsNode});
}

function buildDockerImageWithNodeOutput(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodeDockerBuild", DockerBuildGoal,
        executeDockerBuild(
            sdm.configuration.sdm.projectLoader,
            DefaultDockerImageNameCreator,
            NpmPreparations,
            {
                ...sdm.configuration.sdm.docker.hub as DockerOptions,
                dockerfileFinder: async () => "Dockerfile",
            }), {pushTest: IsNode});
}

function publishUsingNode(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodePublish", PublishGoal,
        executePublish(
            sdm.configuration.sdm.projectLoader,
            NodeProjectIdentifier,
            NpmPreparations,
            {
                ...sdm.configuration.sdm.npm as NpmOptions,
            }), {pushTest: IsNode});
}

function releaseArtifactUsingNode(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodeNpmRelease", ReleaseArtifactGoal,
        executeReleaseNpm(
            sdm.configuration.sdm.projectLoader,
            NodeProjectIdentifier,
            NpmReleasePreparations,
            {
                ...sdm.configuration.sdm.npm as NpmOptions,
            }), {pushTest: IsNode});
}

function releaseDockerImage(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodeDockerRelease", ReleaseDockerGoal,
        executeReleaseDocker(
            sdm.configuration.sdm.projectLoader,
            DockerReleasePreparations,
            {
                ...sdm.configuration.sdm.docker.hub as DockerOptions,
            }), {pushTest: allSatisfied(IsNode, hasFile("Dockerfile"))});
}

function releaseDocsUsingNode(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodeDocsRelease", ReleaseDocsGoal,
        executeReleaseDocs(sdm.configuration.sdm.projectLoader, DocsReleasePreparations), {pushTest: IsNode});
}

function releaseVersionUsingNode(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("nodeVersionRelease", ReleaseVersionGoal,
        executeReleaseVersion(sdm.configuration.sdm.projectLoader, NodeProjectIdentifier), {pushTest: IsNode});
}

function addK8sSideEffectForGoal(sdm: SoftwareDeliveryMachine, goal: Goal) {
    sdm.goalFulfillmentMapper.addSideEffect({
        goal,
        pushTest: IsNode,
        sideEffectName: "@atomist/k8-automation",
    });
}

function tagRepoAsAutomationClient(sdm: SoftwareDeliveryMachine) {
    sdm.addNewRepoWithCodeAction(tagRepo(AutomationClientTagger));
}

function enableTsLintAutofixing(sdm: SoftwareDeliveryMachine) {
    sdm.addAutofix(tslintFix);
}

function fingerprintUsingPackageLock(sdm: SoftwareDeliveryMachine) {
    sdm.addFingerprinterRegistration(new PackageLockFingerprinter());
}

export function addNodeSupport(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalContributions(goalContributors(
        doNothingOnNoMaterialChange(),
        simplifiedKubernetesDeploy(),
        deployWithKubernetes(),
        releaseWithDocker(),
        buildWithDocker(),
        releaseWithNoDockerfilePresent(),
        defaultBuildNode(),
    ));

    enableNodeBuilder(sdm);

    versioningUsingNode(sdm);
    buildDockerImageWithNodeOutput(sdm);
    publishUsingNode(sdm);
    releaseArtifactUsingNode(sdm);
    releaseDockerImage(sdm);
    releaseDocsUsingNode(sdm);
    releaseVersionUsingNode(sdm);

    addK8sSideEffectForGoal(sdm, StagingDeploymentGoal);
    addK8sSideEffectForGoal(sdm, ProductionDeploymentGoal);

    tagRepoAsAutomationClient(sdm);
    enableTsLintAutofixing(sdm);
    fingerprintUsingPackageLock(sdm);

}
