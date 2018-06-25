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
    RepoContext,
    SdmGoal,
    SoftwareDeliveryMachineConfiguration,
    StagingEnvironment,
} from "@atomist/sdm";
import {
    createKubernetesData,
    KubernetesOptions,
} from "@atomist/sdm-pack-k8";

export function kubernetesDataCallback(
    configuration: SoftwareDeliveryMachineConfiguration,
): (goal: SdmGoal, context: RepoContext) => Promise<SdmGoal> {

    return async (goal, ctx) => {
        return configuration.sdm.projectLoader.doWithProject({
            credentials: ctx.credentials, id: ctx.id, context: ctx.context, readOnly: true,
        }, async p => {
            return kubernetesDataFromGoal(goal, p, configuration);
        });
    };
}

async function kubernetesDataFromGoal(
    goal: SdmGoal,
    p: GitProject,
    configuration: Configuration,
): Promise<SdmGoal> {

    const ns = namespaceFromGoal(goal);
    const name = goal.repo.name;
    const options: KubernetesOptions = {
        name,
        environment: configuration.environment,
        ns,
        replicas: 1,
    };
    let kubeGoal;
    if (p.fileExistsSync("package.json")) {
        options.port = 2866;
        kubeGoal = await createKubernetesData(goal, options, p);
    } else if (p.fileExistsSync("pom.xml")) {
        options.port = 8080;
        options.path = `/${name}`;
        options.host = `play.atomist.${(ns === "testing") ? "io" : "com"}`;
        options.protocol = "https";
        (options as any).tlsSecret = options.host.replace(/\./g, "-").replace("play", "star");

        kubeGoal = await createKubernetesData(goal, options, p);
        const goalData = JSON.parse(kubeGoal.data);

        if (goalData && goalData.kubernetes) {
            const kubeData = goalData.kubernetes;
            if (!kubeData.deploymentSpec) {

                const deploymentSpec = {
                    spec: {
                        template: {
                            spec: {
                                containers: [{
                                        env: [{
                                            name: "ATOMIST_TEAM",
                                            value: configuration.teamIds[0], // this only works for non-global SDMs
                                        }, {
                                            name: "ATOMIST_ENVIRONMENT",
                                            value: `${configuration.environment}:${ns}`,
                                        }],
                                    }],
                            },
                        },
                    },
                };

                kubeData.deploymentSpec = JSON.stringify(deploymentSpec);
                goalData.kubernetes = kubeData;
                kubeGoal.data = JSON.stringify(goalData);
            }
        }
    }
    logger.debug(`Kubernetes goal: ${JSON.stringify(kubeGoal)}`);

    return kubeGoal;
}

function namespaceFromGoal(goal: SdmGoal): string {
    const name = goal.repo.name;
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
