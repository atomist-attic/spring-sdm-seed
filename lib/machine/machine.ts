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
    anySatisfied,
    AutofixGoal,
    AutofixRegistration,
    BuildGoal,
    GitHubRepoRef,
    goalContributors,
    Goals,
    hasFile,
    not,
    onAnyPush,
    PushReactionGoal,
    ReviewGoal,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    summarizeGoalsInGitHubStatus,
} from "@atomist/sdm-core";
import {
    configureMavenPerBranchSpringBootDeploy,
    IsMaven,
    ListBranchDeploys,
    MavenBuilder,
    ReplaceReadmeTitle,
    SetAtomistTeamInApplicationYml,
    SpringProjectCreationParameterDefinitions,
    SpringProjectCreationParameters,
    SpringSupport,
    TransformSeedToCustomProject,
} from "@atomist/sdm-pack-spring";
import { executeBuild } from "@atomist/sdm/api-helper/goal/executeBuild";
import axios from "axios";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm: SoftwareDeliveryMachine = createSoftwareDeliveryMachine(
        {
            name: "Spring software delivery machine",
            configuration,
        });

    sdm.addGoalContributions(goalContributors(
        onAnyPush()
            .setGoals(new Goals("Checks", ReviewGoal, PushReactionGoal, AutofixGoal)),
        whenPushSatisfies(anySatisfied(IsMaven))
            .setGoals(BuildGoal),
    ));

    sdm.addGeneratorCommand<SpringProjectCreationParameters>({
        name: "create-spring",
        intent: "create spring",
        description: "Create a new Java Spring Boot REST service",
        parameters: SpringProjectCreationParameterDefinitions,
        startingPoint: new GitHubRepoRef("atomist-seeds", "spring-rest-seed"),
        transform: [
            ReplaceReadmeTitle,
            SetAtomistTeamInApplicationYml,
            TransformSeedToCustomProject,
        ],
    });

    const mavenBuilder = new MavenBuilder(sdm);
    sdm.addGoalImplementation("Maven build",
        BuildGoal,
        executeBuild(sdm.configuration.sdm.projectLoader, mavenBuilder),
        {
            pushTest: IsMaven,
            logInterpreter: mavenBuilder.logInterpreter,
        });

    // SpringSupport provides the TryToUpgradeSpringBootVersion code transform and
    // repository tag support
    sdm.addExtensionPacks(
        SpringSupport,
    );
    configureMavenPerBranchSpringBootDeploy(sdm);
    sdm.addCommand(ListBranchDeploys);

    sdm.addAutofix(AddLicenseFile);

    // Manages a GitHub status check based on the current goals
    summarizeGoalsInGitHubStatus(sdm);

    return sdm;
}

export const LicenseFilename = "LICENSE";

export const AddLicenseFile: AutofixRegistration = {
    name: "License Fix",
    pushTest: not(hasFile(LicenseFilename)),
    transform: async p => {
        const license = await axios.get("https://www.apache.org/licenses/LICENSE-2.0.txt");
        return p.addFile(LicenseFilename, license.data);
    },
};
