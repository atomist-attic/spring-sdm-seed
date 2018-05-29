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
    logger,
} from "@atomist/automation-client";
import { PullRequest } from "@atomist/automation-client/operations/edit/editModes";
import { SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import {
    ChannelLinkListener,
    editorCommand,
    EmptyParameters,
} from "@atomist/sdm";
import * as slack from "@atomist/slack-messages/SlackMessages";

export const AddDockerfileCommandName = "AddDockerfile";

export const addDockerfile: HandleCommand = editorCommand(
    () => addDockerfileEditor,
    AddDockerfileCommandName,
    EmptyParameters,
    {
        intent: "add dockerfile",
        editMode: () => new PullRequest(
            "add-dockerfile",
            "Add Dockerfile",
            "Add Dockerfile to project\n\n[atomist:generated]",
            "Add Dockerfile\n\n[atomist:generated]",
        ),
    });

export const addDockerfileEditor: SimpleProjectEditor = async (p, ctx) => {
    if (p.fileExistsSync("package.json")) {
        return p.addFile("Dockerfile", nodeDockerfile)
            .then(pd => pd.addFile(".dockerignore", nodeDockerignore));
    } else if (p.fileExistsSync("pom.xml")) {
        return p.addFile("Dockerfile", springDockerfile)
            .then(pd => pd.addFile(".dockerignore", springDockerignore));
    }
    logger.info("Project has neither package.json nor pom.xml");
    return p;
};

export const SuggestAddingDockerfile: ChannelLinkListener = async inv => {
    if (!inv.project.fileExistsSync("pom.xml") && !inv.project.fileExistsSync("package.json")) {
        logger.debug(`Not suggesting Dockerfile for ${inv.id}, not a supported project type`);
        return;
    }
    if (inv.project.fileExistsSync("Dockerfile")) {
        logger.debug(`Not suggesting Dockerfile for ${inv.id}, it already has one`);
        return;
    }

    const attachment: slack.Attachment = {
        text: "Add a Dockerfile to your new repo?",
        fallback: "Add a Dockerfile to your new repo?",
        actions: [buttonForCommand({ text: "Add Dockerfile" },
            AddDockerfileCommandName,
            { "targets.owner": inv.id.owner, "targets.repo": inv.id.repo },
        ),
        ],
    };
    const message: slack.SlackMessage = {
        attachments: [attachment],
    };
    return inv.addressNewlyLinkedChannel(message);
};

/* tslint:disable:max-line-length */

const nodeDockerfile = `FROM node:9

LABEL maintainer="Atomist <docker@atomist.com>"

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && dpkg -i dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && rm -f dumb-init_\${DUMB_INIT_VERSION}_amd64.deb

RUN mkdir -p /opt/app

WORKDIR /opt/app

EXPOSE 2866

ENV NPM_CONFIG_LOGLEVEL warn

ENV SUPPRESS_NO_CONFIG_WARNING true

ENTRYPOINT ["dumb-init", "node", "--trace-warnings", "--expose_gc", "--optimize_for_size", "--always_compact", "--max_old_space_size=256"]

CMD ["node_modules/@atomist/automation-client/start.client.js"]

RUN npm install -g npm@6.0.1

COPY package.json package-lock.json ./

RUN npm ci --only=production

COPY . .
`;

const nodeDockerignore = `.idea/
*.iml
.vscode/
**/*~
**/.#*
.git*
.npm*
.travis.yml
.atomist/
assets/kube/
node_modules/
build/test/
build/typedoc/
scripts/
src/
test/
CO*.md
*-deployment.json
ts*.json
**/*.log
**/*.txt
`;

const springDockerfile = `FROM openjdk:8

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && dpkg -i dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && rm -f dumb-init_\${DUMB_INIT_VERSION}_amd64.deb

MAINTAINER Atomist <docker@atomist.com>

RUN mkdir -p /opt/app

WORKDIR /opt/app

EXPOSE 8080

CMD ["-jar", "spring-boot.jar"]

ENTRYPOINT ["dumb-init", "java", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseCGroupMemoryLimitForHeap", "-Xmx256m", "-Djava.security.egd=file:/dev/urandom"]

COPY target/spring-boot.jar spring-boot.jar
`;

const springDockerignore = `*
!target/spring-boot.jar
`;
