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
import {
    AutofixRegistration,
    CodeTransform,
} from "@atomist/sdm";

export const AddDockerfileTransform: CodeTransform<NoParameters> = async p => {
    if (await p.hasFile("pom.xml")) {
        await p.addFile("Dockerfile", dockerFile(p.name));
        await p.addFile(".dockerignore", dockerIgnore(p.name));
    }
    return p;
};

export const AddDockerfileAutofix: AutofixRegistration<NoParameters> = {
    name: "Dockerfile",
    transform: AddDockerfileTransform,
};

function dockerFile(name: string): string {
    return `FROM openjdk:8

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && dpkg -i dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && rm -f dumb-init_\${DUMB_INIT_VERSION}_amd64.deb

MAINTAINER Atomist <docker@atomist.com>

RUN mkdir -p /opt/app

WORKDIR /opt/app

EXPOSE 8080

CMD ["-jar", "${name}.jar"]

ENTRYPOINT ["dumb-init", "java", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseCGroupMemoryLimitForHeap", "-Xmx256m", "-Djava.security.egd=file:/dev/urandom"]

COPY target/${name}.jar ${name}.jar
`;
}

function dockerIgnore(name: string): string {
    return `*
!target/${name}.jar
`
}
