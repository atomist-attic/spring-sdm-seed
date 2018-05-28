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
    ProductionEnvironment,
    SoftwareDeliveryMachineOptions,
    StagingEnvironment,
} from "@atomist/sdm";
import { RepoContext } from "@atomist/sdm/common/context/SdmContext";
import {
    createKubernetesData,
    KubernetesOptions,
} from "@atomist/sdm/handlers/events/delivery/goals/k8s/launchGoalK8";
import { SdmGoal } from "@atomist/sdm/ingesters/sdmGoalIngester";

export function kubernetesDataCallback(
    kind: "node" | "maven",
    options: SoftwareDeliveryMachineOptions,
    configuration: Configuration,
): (goal: SdmGoal, context: RepoContext) => Promise<SdmGoal> {

    return async (goal, ctx) => {
        return options.projectLoader.doWithProject({
            credentials: ctx.credentials, id: ctx.id, context: ctx.context, readOnly: true,
        }, async p => {
            return kubernetesDataFromGoal(kind, goal, p, configuration);
        });
    };
}

function kubernetesDataFromGoal(
    kind: "node" | "maven",
    goal: SdmGoal,
    p: GitProject,
    configuration: Configuration,
): Promise<SdmGoal> {

    const ns = namespaceFromGoal(goal);
    const options: KubernetesOptions = {
        name: goal.repo.name,
        environment: configuration.environment,
        ns,
        replicas: 1,
    };
    if (kind === "node") {
        options.port = 2866;
    } else if (kind === "maven") {
        options.port = 8080;
        options.path = `/${name}`;
        options.host = `play.atomist.${(ns === "testing") ? "io" : "com"}`;
    }
    logger.debug(`Kubernetes goal options: ${JSON.stringify(options)}`);
    return createKubernetesData(goal, options, p);
}

function namespaceFromGoal(goal: SdmGoal): string {
    const name = goal.repo.name;
    logger.debug(`Namespace goal repo name: ${name}`);
    if (name === "k8-automation") {
        return "k8-automation";
    } else if (/-(?:sdm|automation)$/.test(name)) {
        return "sdm";
    } else if (goal.environment === StagingEnvironment.replace(/\/$/, "")) {
        return "testing";
    } else if (goal.environment === ProductionEnvironment.replace(/\/$/, "")) {
        return "production";
    } else {
        logger.debug(`Unmatched goal.environment using default namespace: ${goal.environment}`);
        return "default";
    }
}
