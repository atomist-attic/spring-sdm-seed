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

import { NoParameters } from "@atomist/automation-client/SmartParameters";
import { CodeTransform } from "@atomist/sdm";

export const AddFinalNameToPom: CodeTransform<NoParameters> = async p => {
    if (await p.hasFile("pom.xml")) {

        const pomXml = await p.getFile("pom.xml");
        let pomContent = await pomXml.getContent();

        pomContent = pomContent.replace(/<build>/i, `<build>
\t\t<finalName>\${artifact.name}</finalName>`);

        pomContent = pomContent.replace(/<\/properties>/i, `\t<artifact.name>\${project.artifactId}-\${project.version}</artifact.name>
\t</properties>`);

        await pomXml.setContent(pomContent);
    }
    return p;
};
