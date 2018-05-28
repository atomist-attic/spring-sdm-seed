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

import { HandleCommand, logger } from "@atomist/automation-client";
import { PullRequest } from "@atomist/automation-client/operations/edit/editModes";
import { SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { editorCommand } from "@atomist/sdm";
import { EmptyParameters } from "@atomist/sdm";

export const addDockerfile: HandleCommand = editorCommand(
    () => addDockerfileEditor,
    "AddDockerfile",
    EmptyParameters,
    {
        intent: "add dockerfile",
        editMode: () => new PullRequest(
            "add-dockerfile",
            "Add Dockerfile",
            "Add Dockerfile to project.",
            "Add Dockerfile\n\n[atomist]",
        ),
    });

export const addDockerfileEditor: SimpleProjectEditor = async (p, ctx) => {
    if (p.fileExistsSync("package.json")) {
        return p.addFile("Dockerfile", nodeDockerfile);
    } else if (p.fileExistsSync("pom.xml")) {
        return p.addFile("Dockerfile", springDockerfile);
    }
    logger.info("Project has neither package.json nor pom.xml");
    return p;
};

/* tslint:disable:max-line-length */

const nodeDockerfile = `FROM node:9

LABEL maintainer="Atomist <docker@atomist.com>"

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \
    && dpkg -i dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \
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

const springDockerfile = `FROM openjdk:8

MAINTAINER Atomist <docker@atomist.com>

RUN mkdir -p /opt/app

WORKDIR /opt/app

EXPOSE 8080

CMD ["-jar", "spring-boot.jar"]

ENTRYPOINT ["/usr/bin/java", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseCGroupMemoryLimitForHeap", "-Xmx256m", "-Djava.security.egd=file:/dev/urandom"]

COPY target/spring-boot.jar spring-boot.jar
`;
