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
    Builder,
    BuildGoal,
    Deployer,
    Goal,
    goalContributors,
    JustBuildGoal,
    LocalDeploymentGoal,
    not,
    SoftwareDeliveryMachine,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    DisableDeploy,
    EnableDeploy,
    executeVersioner,
    LocalEndpointGoal,
    LocalUndeploymentGoal,
    lookFor200OnEndpointRootGet,
    ManagedDeploymentTargeter,
    ManagedDeploymentTargetInfo,
    NoGoals,
    StartupInfo,
    tagRepo,
    VersionGoal,
} from "@atomist/sdm-core";
import { ProjectVersioner } from "@atomist/sdm-core/internal/delivery/build/local/projectVersioner";
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
import { executableJarDeployer } from "@atomist/sdm-pack-spring/dist/support/java/deploy/executableJarDeployer";
import { ListLocalDeploys } from "@atomist/sdm-pack-spring/dist/support/maven/deploy/listLocalDeploys";
import { SpringBootSuccessPatterns } from "@atomist/sdm-pack-spring/dist/support/spring/deploy/localSpringBootDeployers";
import * as deploy from "@atomist/sdm/api-helper/dsl/deployDsl";
import {
    branchFromCommit,
    executeBuild,
} from "@atomist/sdm/api-helper/goal/executeBuild";
import { createEphemeralProgressLog } from "@atomist/sdm/api-helper/log/EphemeralProgressLog";
import * as df from "dateformat";
import * as _ from "lodash";
import { MaterialChangeToJvmRepo } from "../support/materialChangeToRepo";
import {
    BuildGoals,
    BuildWithLocalDeploymentGoals,
} from "./goals";

const MavenProjectVersioner: ProjectVersioner = async (status, p) => {
    const projectId = await MavenProjectIdentifier(p);
    const baseVersion = projectId.version.replace(/-.*/, "");
    const branch = branchFromCommit(status.commit).split("/").join(".");
    const branchSuffix = (branch !== status.commit.repo.defaultBranch) ? `${branch}.` : "";
    return `${baseVersion}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;
};

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

function defaultMavenBuild() {
    return whenPushSatisfies(IsMaven, not(HasSpringBootApplicationClass))
        .itMeans("Build Maven")
        .setGoals(BuildGoals);
}

function springBootApplicationBuild() {
    return whenPushSatisfies(IsMaven, HasSpringBootApplicationClass)
        .itMeans("Build Spring Boot")
        .setGoals(BuildWithLocalDeploymentGoals);
}

function versioningWithMaven(sdm: SoftwareDeliveryMachine) {
    sdm.addGoalImplementation("mvnVersioner", VersionGoal,
        executeVersioner(sdm.configuration.sdm.projectLoader, MavenProjectVersioner), {pushTest: IsMaven});
}

function enableSpringBootRepoTagging(sdm: SoftwareDeliveryMachine) {
    sdm.addNewRepoWithCodeAction(tagRepo(springBootTagger));
}

function addLocalEndpointVerification(sdm: SoftwareDeliveryMachine) {
    sdm.addVerifyImplementation();
    sdm.addEndpointVerificationListener(lookFor200OnEndpointRootGet());
}

function configureLocalSpringBootDeployment(sdm: SoftwareDeliveryMachine) {
    sdm.addDeployRules(
        deploy.when(IsMaven, HasSpringBootApplicationClass)
            .itMeans("Maven local deploy")
            .deployTo(LocalDeploymentGoal, LocalEndpointGoal, LocalUndeploymentGoal)
            .using(
                {
                    deployer: springBootExecutableJarDeployer(),
                    targeter: ManagedDeploymentTargeter,
                },
            ))
        .addCommand(ListLocalDeploys)
        .addCommand(EnableDeploy)
        .addCommand(DisableDeploy);
    addLocalEndpointVerification(sdm);
}

function springBootExecutableJarDeployer(): Deployer<ManagedDeploymentTargetInfo> {
    return executableJarDeployer({
        baseUrl: "http://localhost",
        lowerPort: 8088,
        commandLineArgumentsFor: springBootMavenArgs,
        successPatterns: SpringBootSuccessPatterns,
    });
}

function springBootMavenArgs(si: StartupInfo): string[] {
    return [
        `--server.port=${si.port}`,
        `--server.contextPath=${si.contextRoot}`,
        `--server.servlet.contextPath${si.contextRoot}"`,
    ];
}

function addSpringGenerator(sdm: SoftwareDeliveryMachine) {
    const owner = _.get(sdm.configuration, "sdm.seed.spring.owner", "atomist-seeds");
    const repo = _.get(sdm.configuration, "sdm.seed.spring.repo", "spring-rest-seed");
    const seedProject = new GitHubRepoRef(owner, repo);
    sdm.addGenerator(springBootGenerator({
        ...CommonJavaGeneratorConfig,
        seed: () => seedProject,
        groupId: "atomist",
    }, {
        intent: "create spring",
    }));
}

export function addSpringSupport(sdm: SoftwareDeliveryMachine) {
    enableMavenBuilder(sdm);

    sdm.addGoalContributions(goalContributors(
        doNothingOnNoMaterialChange(),
        springBootApplicationBuild(),
        defaultMavenBuild(),
    ));

    versioningWithMaven(sdm);
    configureLocalSpringBootDeployment(sdm);
    addSpringGenerator(sdm);
    enableSpringBootRepoTagging(sdm);
}
