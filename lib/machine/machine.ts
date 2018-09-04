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
    AutoCodeInspection,
    Autofix,
    AutofixRegistration,
    Build,
    goalContributors,
    goals,
    hasFile,
    not,
    onAnyPush,
    PushImpact,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    summarizeGoalsInGitHubStatus,
} from "@atomist/sdm-core";
import {
    addSpringInitializrGenerator,
    configureMavenPerBranchSpringBootDeploy,
    IsMaven,
    ListBranchDeploys,
    MavenBuilder,
    SpringSupport,
} from "@atomist/sdm-pack-spring";
import axios from "axios";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm: SoftwareDeliveryMachine = createSoftwareDeliveryMachine(
        {
            name: "Spring software delivery machine",
            configuration,
        });

    const AutofixGoal = new Autofix().with(AddLicenseFile);

    const BaseGoals = goals("checks")
        .plan(new AutoCodeInspection())
        .plan(new PushImpact())
        .plan(AutofixGoal);

    const BuildGoals = goals("build")
        .plan(new Build().with({ name: "Maven", builder: new MavenBuilder(sdm) }))
        .after(AutofixGoal);

    sdm.addGoalContributions(goalContributors(
        onAnyPush().setGoals(BaseGoals),
        whenPushSatisfies(anySatisfied(IsMaven)).setGoals(BuildGoals),
    ));

    sdm.addExtensionPacks(
        SpringSupport,
    );

    addSpringInitializrGenerator(sdm);
    configureMavenPerBranchSpringBootDeploy(sdm);

    sdm.addCommand(ListBranchDeploys);

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
