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
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import {
    DefaultTags,
    Tags,
} from "@atomist/automation-client/operations/tagger/Tagger";
import { Project } from "@atomist/automation-client/project/Project";

export const AutomationClientTagger: (p: Project, context: HandlerContext, params?: any) => Promise<Tags> =
    async p => {
        try {
            const pjf = await p.findFile("package.json");
            const pjc = await pjf.getContent();
            const pj = JSON.parse(pjc);
            if (pj.dependencies && pj.dependencies["@atomist/automation-client"]) {
                return {
                    repoId: p.id,
                    tags: ["atomist", "nodejs", "typescript", "automation"],
                };
            }
            return {
                repoId: p.id,
                tags: ["nodejs"],
            };
        } catch (e) {
            logger.debug(`Tag error: does not appear to be a Node.js project: ${e.message}`);
            return new DefaultTags(p.id, []);
        }
    };
