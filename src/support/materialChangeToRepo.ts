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

import { logger } from "@atomist/automation-client";
import {
    PushTest,
    pushTest,
} from "@atomist/sdm";
import {
    anyFileChangedSuchThat,
    anyFileChangedWithExtension,
    filesChangedSince,
} from "@atomist/sdm/util/git/filesChangedSince";
import * as _ from "lodash";

/**
 * Veto if change to deployment unit doesn't seem important enough to
 * build and deploy
 *
 * @param kind type of repository, e.g., "Node.js" or "JVM"
 * @param extensions list of file extensions which, if files with any of those exensions have changed, return true
 * @param files list of files which, if any of those files have changed, return true
 * @param directories list of directories which, if files under any of those directories have changed, return true
 * @return true if material changes have occurred, false otherwise
 */
function materialChangeToRepo(
    kind: string,
    extensions: string[] = [],
    files: string[] = [],
    directories: string[] = [],
): PushTest {

    return pushTest(`Material change to ${kind} repository`, async pci => {
        const beforeSha: string = _.get(pci, "push.before.sha");
        const changedFiles = await filesChangedSince(pci.project, beforeSha);
        if (!changedFiles) {
            logger.info("Cannot determine if change is material on %j: can't enumerate changed files", pci.id);
            return true;
        }
        logger.debug(`materialChangeToRepo: Changed files are [${changedFiles.join(",")}]`);
        if (anyFileChangedWithExtension(changedFiles, extensions) ||
            anyFileChangedSuchThat(changedFiles, path => files.some(f => path === f)) ||
            anyFileChangedSuchThat(changedFiles, path => directories.some(d => path.startsWith(d)))) {
            logger.debug("Change is material on %j: changed files=[%s]", pci.id, changedFiles.join(","));
            return true;
        }
        logger.debug("Change is immaterial on %j: changed files=[%s]", pci.id, changedFiles.join(","));
        return false;
    });
}

/**
 * Veto if change to deployment unit doesn't seem important enough to
 * build and deploy
 */
export const MaterialChangeToNodeRepo: PushTest = materialChangeToRepo(
    "Node.js",
    ["js", "ts", "json", "graphql"],
    ["Dockerfile", ".dockerignore"],
    [".atomist/"],
);

/**
 * Veto if change to deployment unit doesn't seem important enough to
 * build and deploy
 */
export const MaterialChangeToJvmRepo: PushTest = materialChangeToRepo(
    "JVM",
    ["java", "html", "json", "yml", "xml", "sh", "kt", "properties"],
    ["Dockerfile", ".dockerignore"],
    [".atomist/"],
);
