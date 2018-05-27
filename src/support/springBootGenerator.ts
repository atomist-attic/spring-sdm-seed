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
    HandleCommand,
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import { AnyProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { chainEditors } from "@atomist/automation-client/operations/edit/projectEditorOps";
import {
    GeneratorCommandDetails,
} from "@atomist/automation-client/operations/generate/generatorToCommand";
import { cleanReadMe } from "@atomist/automation-client/operations/generate/UniversalSeed";
import * as utils from "@atomist/automation-client/project/util/projectUtils";
import {
    GeneratorConfig,
    JavaIdentifierRegExp,
    JavaPackageRegExp,
    MavenArtifactIdRegExp,
    MavenGroupIdRegExp,
} from "@atomist/sdm";
import { generatorHandler } from "@atomist/sdm/common/command/generator/generatorHandler";
import { SeedDrivenGeneratorParametersSupport } from "@atomist/sdm/common/command/generator/SeedDrivenGeneratorParametersSupport";
import { inferStructureAndMovePackage } from "@atomist/spring-automation/commands/generator/java/javaProjectUtils";
import { updatePom } from "@atomist/spring-automation/commands/generator/java/updatePom";
import { inferSpringStructureAndRename } from "@atomist/spring-automation/commands/generator/spring/springBootUtils";
import { curry } from "@typed/curry";
import { camelize } from "tslint/lib/utils";

/**
 * Transform a seed to a Spring Boot project
 */
export function transformSeedToCustomProject(params: SpringProjectCreationParameters): AnyProjectEditor<any> {
    return chainEditors(
        curry(cleanReadMe)(params.target.description),
        p => updatePom(p, params.target.repo, params.artifactId, params.groupId, params.version, params.description),
        curry(inferStructureAndMovePackage)(params.rootPackage),
        curry(inferSpringStructureAndRename)(params.serviceClassName),
    );
}

/**
 * Superclass for all Java project generator parameters.
 */
@Parameters()
export abstract class JavaProjectCreationParameters extends SeedDrivenGeneratorParametersSupport {

    @Parameter({
        ...MavenArtifactIdRegExp,
        displayName: "artifactId",
        required: false,
        order: 51,
    })
    public enteredArtifactId: string = "";

    @Parameter({
        ...MavenGroupIdRegExp,
        required: true,
        order: 50,
    })
    public groupId: string;

    @Parameter({
        ...JavaPackageRegExp,
        required: true,
        order: 53,
    })
    public rootPackage: string;

    get artifactId() {
        return this.enteredArtifactId || this.target.repo;
    }

}

export interface JavaGeneratorConfig extends GeneratorConfig {
    groupId: string;
}

/**
 * Parameters for creating Spring Boot apps.
 */
export class SpringProjectCreationParameters extends JavaProjectCreationParameters {

    @Parameter({
        displayName: "Class Name",
        description: "name for the service class",
        ...JavaIdentifierRegExp,
        required: false,
    })
    public enteredServiceClassName: string;

    constructor(config: JavaGeneratorConfig) {
        super(config);
        this.groupId = config.groupId;
        this.addAtomistWebhook = config.addAtomistWebhook;
    }

    get serviceClassName() {
        return !!this.enteredServiceClassName ?
            toInitialCap(this.enteredServiceClassName) :
            toInitialCap(camelize(this.artifactId));
    }

}

function toInitialCap(s: string) {
    return s.charAt(0).toUpperCase() + s.substr(1);
}

/**
 * Function to create a Spring Boot generator.
 * Relies on generic Atomist Java & Spring functionality in spring-automations
 * @param config config for a Java generator, including location of seed
 * @param details allow customization
 * @return {HandleCommand<SpringProjectCreationParameters>}
 */
export function springBootGenerator(config: JavaGeneratorConfig,
    // tslint:disable-next-line:max-line-length
                                    details: Partial<GeneratorCommandDetails<SpringProjectCreationParameters>> = {}): HandleCommand<SpringProjectCreationParameters> {
    return generatorHandler<SpringProjectCreationParameters>(
        (params, ctx) => chainEditors(
            replaceReadmeTitle(params),
            setAtomistTeamInApplicationYml(params, ctx),
            transformSeedToCustomProject(params),
        ),
        () => {
            const p = new SpringProjectCreationParameters(config);
            // p.target = new BitBucketRepoCreationParameters();
            return p;
        },
        `springBootGenerator-${config.seed.repo}`,
        {
            tags: ["spring", "boot", "java", "generator"],
            ...details,
            intent: config.intent,
        });
}

/**
 * Update the readme
 */
export const replaceReadmeTitle =
    (params: SpringProjectCreationParameters) => async p => {
        return utils.doWithFiles(p, "README.md", readMe => {
            readMe.recordReplace(/^#[\s\S]*?## /, titleBlock(params));
        });
    };

/**
 * Replace the ${ATOMIST_TEAM} placeholder in the seed with the id
 * of the team we are generating for
 * @param params
 * @param ctx
 */
export const setAtomistTeamInApplicationYml =
    (params, ctx) => async p => {
        return utils.doWithFiles(p, "src/main/resources/application.yml", f =>
            f.replace(/\${ATOMIST_TEAM}/, ctx.teamId));
    };

function titleBlock(params: SpringProjectCreationParameters): string {
    return `# ${params.target.repo}
${params.target.description}

Based on seed project \`${params.source.repoRef.owner}:${params.source.repoRef.repo}\`

## `;
}
